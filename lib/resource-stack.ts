import { Duration, Stack, StackProps, Token } from "aws-cdk-lib";
import { AutoScalingGroup, BlockDeviceVolume, EbsDeviceVolumeType, HealthCheck } from "aws-cdk-lib/aws-autoscaling";
import { Certificate, CertificateValidation } from "aws-cdk-lib/aws-certificatemanager";
import {
  AmazonLinuxCpuType,
  CfnEIP,
  CfnInstanceConnectEndpoint,
  CpuCredits,
  InstanceClass,
  InstanceSize,
  InstanceType,
  IpAddresses,
  LaunchTemplate,
  MachineImage,
  Peer,
  Port,
  SecurityGroup,
  SubnetType,
  UserData,
  Vpc,
} from "aws-cdk-lib/aws-ec2";
import {
  ApplicationLoadBalancer,
  ApplicationProtocol,
  ApplicationTargetGroup,
  CfnLoadBalancer,
  ListenerAction,
  NetworkLoadBalancer,
  NetworkTargetGroup,
  Protocol,
  SslPolicy,
  TargetType,
} from "aws-cdk-lib/aws-elasticloadbalancingv2";
import { AlbTarget } from "aws-cdk-lib/aws-elasticloadbalancingv2-targets";
import { CfnInstanceProfile, ManagedPolicy, Role, ServicePrincipal } from "aws-cdk-lib/aws-iam";
import { CfnHealthCheck, CfnRecordSet, HostedZone, RecordType } from "aws-cdk-lib/aws-route53";
import { Construct } from "constructs";
import { readFileSync } from "fs";

export interface DrSampleResourceStackProps extends StackProps {
  serviceName: string;
  area: string;
  azPrimary: string;
  azSecondary: string;
  hostedZoneName: string;
  globalDomainName: string;
  userDataFilePath: string;
  failoverType: string;
}

export class DrSampleResourceStack extends Stack {
  constructor(scope: Construct, id: string, props: DrSampleResourceStackProps) {
    super(scope, id, props);

    const {
      serviceName,
      area,
      azPrimary,
      azSecondary,
      hostedZoneName,
      globalDomainName,
      userDataFilePath,
      failoverType,
    } = props;

    // Hosted zone
    const hostedZone = HostedZone.fromLookup(this, "Route53HostedZone", {
      domainName: hostedZoneName,
    });

    // Certificate
    const certificate = new Certificate(this, "ACMCertificate", {
      certificateName: `${serviceName}-${area}-certificate`,
      domainName: globalDomainName,
      subjectAlternativeNames: [globalDomainName, "*." + globalDomainName],
      validation: CertificateValidation.fromDns(hostedZone),
    });

    // VPC
    const vpc = new Vpc(this, "EC2VPC", {
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
    const ec2Role = new Role(this, "IAMEC2InstanceRole", {
      roleName: `${serviceName}-${area}-instance-role`,
      assumedBy: new ServicePrincipal("ec2.amazonaws.com"),
      managedPolicies: [
        ManagedPolicy.fromManagedPolicyArn(this, "SSMAccess", "arn:aws:iam::aws:policy/AmazonSSMManagedInstanceCore"),
      ],
    });
    new CfnInstanceProfile(this, "IAMEC2InstanceProfile", {
      instanceProfileName: `${serviceName}-${area}-instance-profile`,
      roles: [ec2Role.roleName],
    });

    // EC2 SecurityGroup
    const ec2SecurityGroupName = `${serviceName}-${area}-ec2-security-group`;
    const ec2SecurityGroup = new SecurityGroup(this, "EC2InstanceSecurityGroup", {
      securityGroupName: ec2SecurityGroupName,
      description: ec2SecurityGroupName,
      vpc: vpc,
      allowAllOutbound: true,
    });

    // EC2 UserData
    const userData = UserData.forLinux({ shebang: "#!/bin/bash" });
    userData.addCommands(readFileSync(userDataFilePath, "utf8"));

    // EC2 LaunchTemplate
    const launchTemplate = new LaunchTemplate(this, "EC2LaunchTemplate", {
      launchTemplateName: `${serviceName}-${area}-template`,
      instanceType: InstanceType.of(InstanceClass.T3, InstanceSize.MICRO),
      cpuCredits: CpuCredits.STANDARD,
      machineImage: MachineImage.latestAmazonLinux2({
        cpuType: AmazonLinuxCpuType.X86_64,
      }),
      blockDevices: [
        {
          deviceName: "/dev/xvda",
          volume: BlockDeviceVolume.ebs(8, {
            volumeType: EbsDeviceVolumeType.GP3,
          }),
        },
      ],
      securityGroup: ec2SecurityGroup,
      role: ec2Role,
      requireImdsv2: true,
      userData: userData,
    });

    // AutoScalingGroup
    const asg = new AutoScalingGroup(this, "AutoScalingGroup", {
      autoScalingGroupName: `${serviceName}-${area}-instance`,
      launchTemplate: launchTemplate,
      minCapacity: 2,
      maxCapacity: 2,
      vpc,
      vpcSubnets: {
        subnetType: SubnetType.PRIVATE_WITH_EGRESS,
      },
      healthCheck: HealthCheck.elb({
        grace: Duration.minutes(10),
      }),
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
      internetFacing: false,
      securityGroup: albSecurityGroup,
    });
    alb.node.addDependency(asg);
    albSecurityGroup.addIngressRule(
      Peer.ipv4("0.0.0.0/0"),
      Port.tcp(443),
      "Allow access to ALB from anyone on port 443",
      false
    );
    albSecurityGroup.addIngressRule(
      Peer.ipv4("0.0.0.0/0"),
      Port.tcp(80),
      "Allow access to ALB from anyone on port 80",
      false
    );
    asg.connections.allowFrom(alb, Port.tcp(80), "Allow access to EC2 instance from ALB on port 80");

    // ALB HTTPS listener
    alb.addListener("ALBListenerHTTPS", {
      protocol: ApplicationProtocol.HTTPS,
      sslPolicy: SslPolicy.TLS13_13,
      certificates: [
        {
          certificateArn: certificate.certificateArn,
        },
      ],
      defaultTargetGroups: [
        new ApplicationTargetGroup(this, "ALBTargetGroup", {
          targetGroupName: `${serviceName}-${area}-alb-tg`,
          targetType: TargetType.INSTANCE,
          targets: [asg],
          protocol: ApplicationProtocol.HTTP,
          port: 80,
          healthCheck: {
            protocol: Protocol.HTTP,
            port: "traffic-port",
          },
          vpc: vpc,
        }),
      ],
    });

    // ALB HTTP listener
    alb.addListener("ALBListenerHTTP", {
      protocol: ApplicationProtocol.HTTP,
      defaultAction: ListenerAction.redirect({
        protocol: "HTTPS",
        port: "443",
        host: "#{host}",
        path: "/#{path}",
        query: "#{query}",
        permanent: true,
      }),
    });

    // EC2 Instance Connect endpoint SecurityGroup
    const eicSecurityGroupName = `${serviceName}-${area}-eic-security-group`;
    const eicSecurityGroup = new SecurityGroup(this, "EC2InstanceConnectSecurityGroup", {
      securityGroupName: eicSecurityGroupName,
      description: eicSecurityGroupName,
      vpc: vpc,
      allowAllOutbound: false,
    });
    eicSecurityGroup.connections.allowTo(
      asg,
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

    // NLB
    const nlb = new NetworkLoadBalancer(this, "NLB", {
      loadBalancerName: `${serviceName}-${area}-nlb`,
      vpc: vpc,
      vpcSubnets: vpc.selectSubnets({ subnetType: SubnetType.PUBLIC }),
      internetFacing: true,
      crossZoneEnabled: true,
    });
    nlb.node.addDependency(alb);

    // Allocate EIPs for NLB
    const cfnLoadBalancer = nlb.node.defaultChild as CfnLoadBalancer;
    cfnLoadBalancer.subnetMappings = vpc.publicSubnets.map((subnet, i) => {
      const eip = new CfnEIP(this, `NLBEIP${i}`, {
        domain: "vpc",
      });
      nlb.node.addDependency(eip);
      return {
        subnetId: subnet.subnetId,
        allocationId: Token.asString(eip.getAtt("AllocationId")),
      } as CfnLoadBalancer.SubnetMappingProperty;
    });
    if (cfnLoadBalancer.subnetMappings !== undefined) {
      cfnLoadBalancer.subnets = undefined;
    }

    // NLB TCP443 listerner
    nlb.addListener("NLBListenerTCP443", {
      protocol: Protocol.TCP,
      port: 443,
      defaultTargetGroups: [
        new NetworkTargetGroup(this, "NLBTargetGroupTCP443", {
          targetGroupName: `${serviceName}-${area}-nlb443-tg`,
          targetType: TargetType.ALB,
          targets: [new AlbTarget(alb, 443)],
          protocol: Protocol.TCP,
          port: 443,
          preserveClientIp: true,
          healthCheck: {
            protocol: Protocol.HTTP,
            port: "80",
          },
          vpc: vpc,
        }),
      ],
    });

    // NLB TCP80 listerner
    nlb.addListener("NLBListenerTCP80", {
      protocol: Protocol.TCP,
      port: 80,
      defaultTargetGroups: [
        new NetworkTargetGroup(this, "NLBTargetGroupTCP80", {
          targetGroupName: `${serviceName}-${area}-nlb80-tg`,
          targetType: TargetType.ALB,
          targets: [new AlbTarget(alb, 80)],
          protocol: Protocol.TCP,
          port: 80,
          preserveClientIp: true,

          healthCheck: {
            protocol: Protocol.HTTP,
            port: "traffic-port",
          },
          vpc: vpc,
        }),
      ],
    });

    // Route53 health check
    const dnsHealthCheck = new CfnHealthCheck(this, "Route53HealthCheck", {
      healthCheckConfig: {
        type: "HTTP",
        fullyQualifiedDomainName: nlb.loadBalancerDnsName,
        port: 80,
        resourcePath: "/",
        requestInterval: 10,
        failureThreshold: 3,
        measureLatency: false,
      },
      healthCheckTags: [
        {
          key: "Name",
          value: `${serviceName}-${area}-healthcheck`,
        },
      ],
    });
    dnsHealthCheck.node.addDependency(nlb);

    // A record for DNS failover
    const nlbARecord = new CfnRecordSet(this, "Route53RecordSet", {
      name: globalDomainName,
      type: RecordType.A,
      aliasTarget: {
        dnsName: nlb.loadBalancerDnsName,
        hostedZoneId: nlb.loadBalancerCanonicalHostedZoneId,
        evaluateTargetHealth: true,
      },
      failover: failoverType,
      healthCheckId: dnsHealthCheck.attrHealthCheckId,
      hostedZoneId: hostedZone.hostedZoneId,
      setIdentifier: `${serviceName}-${area}-id`,
    });
    nlbARecord.node.addDependency(dnsHealthCheck);
  }
}
