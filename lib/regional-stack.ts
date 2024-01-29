import * as cdk from "aws-cdk-lib";
import { Construct } from "constructs";
import { Database } from "./constructs/database";
import { Network } from "./constructs/network";
import { Service } from "./constructs/service";

export interface DrSampleRegionalStackProps extends cdk.StackProps {
  serviceName: string;
  area: "tokyo" | "osaka";
  cidr: string;
  azPrimary: string;
  azSecondary: string;
  globalDatabaseIdentifier: string;
  isPrimaryDatabaseCluster: boolean;
  hostedZoneName: string;
  globalDomainName: string;
  userDataFilePath: string;
}

export class DrSampleRegionalStack extends cdk.Stack {
  public readonly vpc: cdk.aws_ec2.IVpc;
  public readonly region: string;
  public readonly hostedZone: cdk.aws_route53.IHostedZone;
  public readonly alb: cdk.aws_elasticloadbalancingv2.IApplicationLoadBalancer;

  constructor(scope: Construct, id: string, props: DrSampleRegionalStackProps) {
    super(scope, id, props);

    // VPC-related resources
    const network = new Network(this, "Network", {
      cidr: props.cidr,
      azPrimary: props.azPrimary,
      azSecondary: props.azSecondary,
    });

    // Aurora global database
    const database = new Database(this, "Database", {
      serviceName: props.serviceName,
      area: props.area,
      globalDatabaseIdentifier: props.globalDatabaseIdentifier,
      isPrimaryDatabaseCluster: props.isPrimaryDatabaseCluster,
      vpc: network.vpc,
      privateSubnets: network.privateSubnets,
      isolatedSubnets: network.isolatedSubnets,
    });

    // Certificate, ALB and AutoScalingGroup for web aplication
    const service = new Service(this, "Service", {
      serviceName: props.serviceName,
      area: props.area,
      hostedZoneName: props.hostedZoneName,
      globalDomainName: props.globalDomainName,
      userDataFilePath: props.userDataFilePath,
      vpc: network.vpc,
      privateSubnets: network.privateSubnets,
      dbCluster: database.dbCluster,
      dbListenerPort: database.dbListenerPort,
    });

    // Add props
    this.vpc = network.vpc;
    this.region = this.region;
    this.hostedZone = service.hostedZone;
    this.alb = service.alb;
  }
}
