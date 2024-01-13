import { Stack, StackProps } from "aws-cdk-lib";
import { Certificate, CertificateValidation } from "aws-cdk-lib/aws-certificatemanager";
import {
  AmazonLinuxCpuType,
  BlockDeviceVolume,
  CfnInstanceConnectEndpoint,
  EbsDeviceVolumeType,
  Instance,
  InstanceClass,
  InstanceSize,
  InstanceType,
  IpAddresses,
  MachineImage,
  Peer,
  Port,
  SecurityGroup,
  SubnetType,
  UserData,
  Vpc,
} from "aws-cdk-lib/aws-ec2";
import { ApplicationLoadBalancer, ApplicationProtocol, SslPolicy } from "aws-cdk-lib/aws-elasticloadbalancingv2";
import { InstanceTarget } from "aws-cdk-lib/aws-elasticloadbalancingv2-targets";
import { CfnInstanceProfile, ManagedPolicy, Role, ServicePrincipal } from "aws-cdk-lib/aws-iam";
import { ARecord, HostedZone, RecordTarget } from "aws-cdk-lib/aws-route53";
import { LoadBalancerTarget } from "aws-cdk-lib/aws-route53-targets";
import { Construct } from "constructs";
import { readFileSync } from "fs";

export interface DrSampleResourceStackProps extends StackProps {
  serviceName: string;
  area: string;
  azPrimary: string;
  azSecondary: string;
  hostedZoneName: string;
  globalDomainName: string;
  regionalDomainName: string;
  userDataFilePath: string;
}

export class DrSampleResourceStack extends Stack {
  public readonly alb: ApplicationLoadBalancer;

  constructor(scope: Construct, id: string, props: DrSampleResourceStackProps) {
    super(scope, id, props);

    const {
      serviceName,
      area,
      azPrimary,
      azSecondary,
      hostedZoneName,
      globalDomainName,
      regionalDomainName,
      userDataFilePath,
    } = props;

    // Hosted zone
    const hostedZone = HostedZone.fromLookup(this, "HostedZone", {
      domainName: hostedZoneName,
    });

    // Certificate
    const certificate = new Certificate(this, "Certificate", {
      certificateName: `${serviceName}-${area}-certificate`,
      domainName: regionalDomainName,
      subjectAlternativeNames: ["*." + regionalDomainName, globalDomainName, "*." + globalDomainName],
      validation: CertificateValidation.fromDns(hostedZone),
    });

    // VPC
    const vpc = new Vpc(this, "VPC", {
      ipAddresses: IpAddresses.cidr("10.0.0.0/16"),
      availabilityZones: [azPrimary, azSecondary],
      natGateways: 1,
      subnetConfiguration: [
        {
          name: "Public",
          subnetType: SubnetType.PUBLIC,
          cidrMask: 24,
        },
        {
          name: "Private",
          subnetType: SubnetType.PRIVATE_WITH_EGRESS,
          cidrMask: 24,
        },
        // This sample does not create databases
        //{
        //  name: "Isolated",
        //  subnetType: SubnetType.PRIVATE_ISOLATED,
        //  cidrMask: 24,
        //},
      ],
    });

    // EC2 instance role (currently not in use)
    const ec2Role = new Role(this, `InstanceRole`, {
      roleName: `${serviceName}-${area}-instance-role`,
      assumedBy: new ServicePrincipal("amazonaws.com"),
      managedPolicies: [
        ManagedPolicy.fromManagedPolicyArn(this, "SSMAccess", "arn:aws:iam::aws:policy/AmazonSSMManagedInstanceCore"),
      ],
    });
    new CfnInstanceProfile(this, "InstanceProfile", {
      instanceProfileName: `${serviceName}-${area}-instance-profile`,
      roles: [ec2Role.roleName],
    });

    // EC2 SecurityGroup
    const ec2SecurityGroupName = `${serviceName}-${area}-ec2-security-group`;
    const ec2SecurityGroup = new SecurityGroup(this, "EC2SecurityGroup", {
      securityGroupName: ec2SecurityGroupName,
      description: ec2SecurityGroupName,
      vpc: vpc,
      allowAllOutbound: true,
    });

    // EC2 settings
    const ec2BlockDevices = [
      {
        deviceName: "/dev/xvda",
        volume: BlockDeviceVolume.ebs(8, {
          volumeType: EbsDeviceVolumeType.GP3,
        }),
      },
    ];
    const userData = UserData.forLinux({ shebang: "#!/bin/bash" });
    userData.addCommands(readFileSync(userDataFilePath, "utf8"));

    // EC2 instances
    const ec2Instance1 = new Instance(this, "EC2Instance1", {
      instanceName: `${serviceName}-${area}-instance-1`,
      instanceType: InstanceType.of(InstanceClass.T2, InstanceSize.MICRO),
      machineImage: MachineImage.latestAmazonLinux2({
        cpuType: AmazonLinuxCpuType.X86_64,
      }),
      blockDevices: ec2BlockDevices,
      propagateTagsToVolumeOnCreation: true,
      vpc,
      vpcSubnets: {
        subnetType: SubnetType.PRIVATE_WITH_EGRESS,
      },
      availabilityZone: azPrimary,
      securityGroup: ec2SecurityGroup,
      role: ec2Role,
      userData: userData,
    });
    const ec2Instance2 = new Instance(this, "EC2Instance2", {
      instanceName: `${serviceName}-${area}-instance-2`,
      instanceType: InstanceType.of(InstanceClass.T2, InstanceSize.MICRO),
      machineImage: MachineImage.latestAmazonLinux2({
        cpuType: AmazonLinuxCpuType.X86_64,
      }),
      blockDevices: ec2BlockDevices,
      propagateTagsToVolumeOnCreation: true,
      vpc,
      vpcSubnets: {
        subnetType: SubnetType.PRIVATE_WITH_EGRESS,
      },
      availabilityZone: azPrimary,
      securityGroup: ec2SecurityGroup,
      role: ec2Role,
      userData: userData,
    });

    // ALB security group
    const albSecurityGroupName = `${serviceName}-${area}-alb-security-group`;
    const albSecurityGroup = new SecurityGroup(this, "ALBSecurityGroup", {
      securityGroupName: albSecurityGroupName,
      description: albSecurityGroupName,
      vpc: vpc,
      allowAllOutbound: false,
    });

    // ALB
    const alb = new ApplicationLoadBalancer(this, "ALB", {
      loadBalancerName: `${serviceName}-${area}-alb`,
      vpc: vpc,
      vpcSubnets: vpc.selectSubnets({ subnetType: SubnetType.PUBLIC }),
      internetFacing: true,
      securityGroup: albSecurityGroup,
    });
    alb.node.addDependency(ec2Instance1);
    alb.node.addDependency(ec2Instance2);
    albSecurityGroup.addIngressRule(
      Peer.ipv4("0.0.0.0/0"),
      Port.tcp(443),
      "Allow access to ALB from anyone on port 443",
      false
    );
    ec2Instance1.connections.allowFrom(alb, Port.tcp(80), "Allow access to EC2 instance from ALB on port 80");
    ec2Instance2.connections.allowFrom(alb, Port.tcp(80), "Allow access to EC2 instance from ALB on port 80");

    // ALB HTTPS listener
    const albListener = alb.addListener("Listener", {
      protocol: ApplicationProtocol.HTTPS,
      sslPolicy: SslPolicy.TLS13_13,
      certificates: [
        {
          certificateArn: certificate.certificateArn,
        },
      ],
    });
    albListener.addTargets("ALBTarget", {
      targetGroupName: `${serviceName}-${area}-tg`,
      targets: [new InstanceTarget(ec2Instance1, 80), new InstanceTarget(ec2Instance2, 80)],
      protocol: ApplicationProtocol.HTTP,
    });
    alb.node.addDependency(ec2Instance1);
    alb.node.addDependency(ec2Instance2);

    // EC2 Instance Connect endpoint SecurityGroup
    const eicSecurityGroupName = `${serviceName}-${area}-eic-security-group`;
    const eicSecurityGroup = new SecurityGroup(this, "EICSecurityGroup", {
      securityGroupName: eicSecurityGroupName,
      description: eicSecurityGroupName,
      vpc: vpc,
      allowAllOutbound: false,
    });
    eicSecurityGroup.connections.allowTo(
      ec2Instance1,
      Port.tcp(22),
      "Allow access to EC2 instance from EC2 Instance Connect on port 22"
    );
    eicSecurityGroup.connections.allowTo(
      ec2Instance2,
      Port.tcp(22),
      "Allow access to EC2 instance from EC2 Instance Connect on port 22"
    );

    // EC2 Instance Connect endpoint
    new CfnInstanceConnectEndpoint(this, "EC2InstanceConnectEndpoint", {
      subnetId: vpc.publicSubnets[0].subnetId,
      securityGroupIds: [eicSecurityGroup.securityGroupId],
      preserveClientIp: true,
      clientToken: `${serviceName}-${area}-eic-client-token`,
    });
    ec2SecurityGroup.addIngressRule(
      Peer.securityGroupId(eicSecurityGroup.securityGroupId),
      Port.tcp(22),
      "Allow access to EC2 instance from EC2 Instance Connect on port 22",
      false
    );

    // Alias record for ALB
    const albARecord = new ARecord(this, "ALBARecord", {
      recordName: regionalDomainName,
      target: RecordTarget.fromAlias(new LoadBalancerTarget(alb)),
      zone: hostedZone,
    });
    albARecord.node.addDependency(alb);

    // Add ALB to props
    this.alb = alb;
  }
}
