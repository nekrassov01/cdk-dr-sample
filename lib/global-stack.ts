import * as cdk from "aws-cdk-lib";
import { Construct } from "constructs";
import { Accelerator } from "./constructs/accelerator";

export interface DrSampleGlobalStackProps extends cdk.StackProps {
  serviceName: string;
  globalDomainName: string;
  hostedZone: cdk.aws_route53.IHostedZone;
  albPrimary: cdk.aws_elasticloadbalancingv2.IApplicationLoadBalancer;
  albSecondary: cdk.aws_elasticloadbalancingv2.IApplicationLoadBalancer;
}

export class DrSampleGlobalStack extends cdk.Stack {
  constructor(scope: Construct, id: string, props: DrSampleGlobalStackProps) {
    super(scope, id, props);

    new Accelerator(this, "Accelerator", {
      serviceName: props.serviceName,
      hostedZone: props.hostedZone,
      globalDomainName: props.globalDomainName,
      albPrimary: props.albPrimary,
      albSecondary: props.albSecondary,
    });
  }
}
