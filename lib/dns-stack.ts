import { Stack, StackProps } from "aws-cdk-lib";
import { NetworkLoadBalancer } from "aws-cdk-lib/aws-elasticloadbalancingv2";
import { ARecord, HostedZone, RecordTarget } from "aws-cdk-lib/aws-route53";
import { LoadBalancerTarget } from "aws-cdk-lib/aws-route53-targets";

import { Construct } from "constructs";

export interface DrSampleDNSStackProps extends StackProps {
  hostedZoneName: string;
  globalDomainName: string;
  nlb: NetworkLoadBalancer;
}

export class DrSampleDNSStack extends Stack {
  constructor(scope: Construct, id: string, props: DrSampleDNSStackProps) {
    super(scope, id, props);

    const { hostedZoneName, globalDomainName, nlb } = props;

    // Hosted zone
    const hostedZone = HostedZone.fromLookup(this, "Route53HostedZone", {
      domainName: hostedZoneName,
    });

    // Alias record for NLB
    const nlbARecord = new ARecord(this, "Route53NLBARecord", {
      recordName: globalDomainName,
      target: RecordTarget.fromAlias(new LoadBalancerTarget(nlb)),
      zone: hostedZone,
    });
    nlbARecord.node.addDependency(nlb);
  }
}
