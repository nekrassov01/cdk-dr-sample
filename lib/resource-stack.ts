import {
  Stack,
  StackProps,
  aws_ec2 as ec2,
  aws_elasticloadbalancingv2 as elbv2,
  aws_elasticloadbalancingv2_targets as elbtargets,
  aws_iam as iam,
  aws_route53 as route53,
  aws_route53_targets as route53_targets,
  aws_certificatemanager as acm,
} from "aws-cdk-lib";
import { Construct } from "constructs";
import { readFileSync } from "fs";

export interface DrSampleResourceStackProps extends StackProps {
  serviceName: string;
  area: String;
  azA: string;
  azC: string;
  hostedZoneName: string;
  userDataFilePath: string;
}

export class DrSampleResourceStack extends Stack {
  public readonly alb: elbv2.ApplicationLoadBalancer;

  constructor(scope: Construct, id: string, props: DrSampleResourceStackProps) {
    super(scope, id, props);

    const { serviceName, area, azA, azC, hostedZoneName, userDataFilePath } = props;

    // Domain name
    const globalDomainName = `${serviceName}.${hostedZoneName}`;
    const regionalDomainName = `${serviceName}-${area}.${hostedZoneName}`;

    // Hosted zone
    const hostedZone = route53.HostedZone.fromLookup(this, "HostedZone", {
      domainName: hostedZoneName,
    });

    // Certificate
    const certificate = new acm.Certificate(this, "Certificate", {
      certificateName: `${serviceName}-${area}-certificate`,
      domainName: regionalDomainName,
      subjectAlternativeNames: ["*." + regionalDomainName, globalDomainName, "*." + globalDomainName],
      validation: acm.CertificateValidation.fromDns(hostedZone),
    });

    // VPC
    const vpc = new ec2.Vpc(this, "VPC", {
      ipAddresses: ec2.IpAddresses.cidr("10.0.0.0/16"),
      availabilityZones: [azA, azC],
      natGateways: 1,
      subnetConfiguration: [
        {
          name: "Public",
          subnetType: ec2.SubnetType.PUBLIC,
          cidrMask: 24,
        },
        {
          name: "Private",
          subnetType: ec2.SubnetType.PRIVATE_WITH_EGRESS,
          cidrMask: 24,
        },
        {
          name: "Isolated",
          subnetType: ec2.SubnetType.PRIVATE_ISOLATED,
          cidrMask: 24,
        },
      ],
    });

    // EC2 instance role (currently not in use)
    const ec2Role = new iam.Role(this, `InstanceRole`, {
      roleName: `${serviceName}-${area}-instance-role`,
      assumedBy: new iam.ServicePrincipal("ec2.amazonaws.com"),
      managedPolicies: [
        iam.ManagedPolicy.fromManagedPolicyArn(
          this,
          "SSMAccess",
          "arn:aws:iam::aws:policy/AmazonSSMManagedInstanceCore"
        ),
      ],
    });
    new iam.CfnInstanceProfile(this, "InstanceProfile", {
      instanceProfileName: `${serviceName}-${area}-instance-profile`,
      roles: [ec2Role.roleName],
    });

    // EC2 SecurityGroup
    const ec2SecurityGroupName = `${serviceName}-${area}-ec2-security-group`;
    const ec2SecurityGroup = new ec2.SecurityGroup(this, "EC2SecurityGroup", {
      securityGroupName: ec2SecurityGroupName,
      description: ec2SecurityGroupName,
      vpc: vpc,
      allowAllOutbound: true,
    });

    // EC2 settings
    const ec2BlockDevices = [
      {
        deviceName: "/dev/xvda",
        volume: ec2.BlockDeviceVolume.ebs(8, {
          volumeType: ec2.EbsDeviceVolumeType.GP3,
        }),
      },
    ];
    const userData = ec2.UserData.forLinux({ shebang: "#!/bin/bash" });
    userData.addCommands(readFileSync(userDataFilePath, "utf8"));

    // EC2 instances
    const ec2Instance1 = new ec2.Instance(this, "EC2Instance1", {
      instanceName: `${serviceName}-${area}-instance-1`,
      instanceType: ec2.InstanceType.of(ec2.InstanceClass.T2, ec2.InstanceSize.MICRO),
      machineImage: ec2.MachineImage.latestAmazonLinux2({
        cpuType: ec2.AmazonLinuxCpuType.X86_64,
      }),
      blockDevices: ec2BlockDevices,
      propagateTagsToVolumeOnCreation: true,
      vpc,
      vpcSubnets: {
        subnetType: ec2.SubnetType.PRIVATE_WITH_EGRESS,
      },
      availabilityZone: azA,
      securityGroup: ec2SecurityGroup,
      role: ec2Role,
      userData: userData,
    });
    const ec2Instance2 = new ec2.Instance(this, "EC2Instance2", {
      instanceName: `${serviceName}-${area}-instance-2`,
      instanceType: ec2.InstanceType.of(ec2.InstanceClass.T2, ec2.InstanceSize.MICRO),
      machineImage: ec2.MachineImage.latestAmazonLinux2({
        cpuType: ec2.AmazonLinuxCpuType.X86_64,
      }),
      blockDevices: ec2BlockDevices,
      propagateTagsToVolumeOnCreation: true,
      vpc,
      vpcSubnets: {
        subnetType: ec2.SubnetType.PRIVATE_WITH_EGRESS,
      },
      availabilityZone: azA,
      securityGroup: ec2SecurityGroup,
      role: ec2Role,
      userData: userData,
    });

    // ALB security group
    const albSecurityGroupName = `${serviceName}-${area}-alb-security-group`;
    const albSecurityGroup = new ec2.SecurityGroup(this, "ALBSecurityGroup", {
      securityGroupName: albSecurityGroupName,
      description: albSecurityGroupName,
      vpc: vpc,
      allowAllOutbound: false,
    });

    // ALB
    const alb = new elbv2.ApplicationLoadBalancer(this, "ALB", {
      loadBalancerName: `${serviceName}-${area}-alb`,
      vpc: vpc,
      vpcSubnets: vpc.selectSubnets({ subnetType: ec2.SubnetType.PUBLIC }),
      internetFacing: true,
      securityGroup: albSecurityGroup,
    });
    alb.node.addDependency(ec2Instance1);
    alb.node.addDependency(ec2Instance2);
    albSecurityGroup.addIngressRule(
      ec2.Peer.ipv4("0.0.0.0/0"),
      ec2.Port.tcp(443),
      "Allow access to ALB from anyone on port 443",
      false
    );
    ec2Instance1.connections.allowFrom(alb, ec2.Port.tcp(80), "Allow access to EC2 instance from ALB on port 80");
    ec2Instance2.connections.allowFrom(alb, ec2.Port.tcp(80), "Allow access to EC2 instance from ALB on port 80");

    // ALB HTTPS listener
    const albListener = alb.addListener("Listener", {
      protocol: elbv2.ApplicationProtocol.HTTPS,
      sslPolicy: elbv2.SslPolicy.TLS13_13,
      certificates: [
        {
          certificateArn: certificate.certificateArn,
        },
      ],
    });
    albListener.addTargets("ALBTarget", {
      targetGroupName: `${serviceName}-${area}-tg`,
      targets: [new elbtargets.InstanceTarget(ec2Instance1, 80), new elbtargets.InstanceTarget(ec2Instance2, 80)],
      protocol: elbv2.ApplicationProtocol.HTTP,
    });
    alb.node.addDependency(ec2Instance1);
    alb.node.addDependency(ec2Instance2);

    // EC2 Instance Connect endpoint SecurityGroup
    const eicSecurityGroupName = `${serviceName}-${area}-eic-security-group`;
    const eicSecurityGroup = new ec2.SecurityGroup(this, "EICSecurityGroup", {
      securityGroupName: eicSecurityGroupName,
      description: eicSecurityGroupName,
      vpc: vpc,
      allowAllOutbound: false,
    });
    eicSecurityGroup.connections.allowTo(
      ec2Instance1,
      ec2.Port.tcp(22),
      "Allow access to EC2 instance from EC2 Instance Connect on port 22"
    );
    eicSecurityGroup.connections.allowTo(
      ec2Instance2,
      ec2.Port.tcp(22),
      "Allow access to EC2 instance from EC2 Instance Connect on port 22"
    );

    // EC2 Instance Connect endpoint
    new ec2.CfnInstanceConnectEndpoint(this, "EC2InstanceConnectEndpoint", {
      subnetId: vpc.publicSubnets[0].subnetId,
      securityGroupIds: [eicSecurityGroup.securityGroupId],
      preserveClientIp: true,
      clientToken: `${serviceName}-${area}-eic-client-token`,
    });
    ec2SecurityGroup.addIngressRule(
      ec2.Peer.securityGroupId(eicSecurityGroup.securityGroupId),
      ec2.Port.tcp(22),
      "Allow access to EC2 instance from EC2 Instance Connect on port 22",
      false
    );

    // Alias record for ALB
    const albARecord = new route53.ARecord(this, "ALBARecord", {
      recordName: regionalDomainName,
      target: route53.RecordTarget.fromAlias(new route53_targets.LoadBalancerTarget(alb)),
      zone: hostedZone,
    });
    albARecord.node.addDependency(alb);

    // Add ALB to props
    this.alb = alb;
  }
}
