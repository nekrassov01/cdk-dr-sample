import * as cdk from "aws-cdk-lib";
import { Stack, StackProps } from "aws-cdk-lib";
import { Construct } from "constructs";
import { Database } from "./constructs/database";
import { DNS } from "./constructs/dns";
import { Network } from "./constructs/network";
import { Service } from "./constructs/service";

export interface DrSampleRegionalStackProps extends StackProps {
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
  failoverType: string;
}

export class DrSampleRegionalStack extends Stack {
  public readonly vpc: cdk.aws_ec2.IVpc;
  public readonly region: string;

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

    // Certificate, NLB, ALB and AutoScalingGroup for web aplication
    const service = new Service(this, "Service", {
      serviceName: props.serviceName,
      area: props.area,
      azPrimary: props.azPrimary,
      azSecondary: props.azSecondary,
      globalDatabaseIdentifier: props.globalDatabaseIdentifier,
      isPrimaryDatabaseCluster: props.isPrimaryDatabaseCluster,
      hostedZoneName: props.hostedZoneName,
      globalDomainName: props.globalDomainName,
      userDataFilePath: props.userDataFilePath,
      vpc: network.vpc,
      publicSubnets: network.publicSubnets,
      privateSubnets: network.privateSubnets,
      isolatedSubnets: network.isolatedSubnets,
      dbCluster: database.dbCluster,
      dbListenerPort: database.dbListenerPort,
    });

    // Route53 DNS record for failover
    new DNS(this, "DNS", {
      serviceName: props.serviceName,
      area: props.area,
      hostedZone: service.hostedZone,
      globalDomainName: props.globalDomainName,
      failoverType: props.failoverType,
      nlb: service.nlb,
    });

    // Add props
    this.vpc = network.vpc;
    this.region = this.region;
  }
}
