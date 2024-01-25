import * as cdk from "aws-cdk-lib";
import { Construct } from "constructs";

export interface DNSProps {
  serviceName: string;
  area: string;
  globalDomainName: string;
  failoverType: string;
  hostedZone: cdk.aws_route53.IHostedZone;
  nlb: cdk.aws_elasticloadbalancingv2.INetworkLoadBalancer;
}

export class DNS extends Construct {
  constructor(scope: Construct, id: string, props: DNSProps) {
    super(scope, id);

    // Route53 health check
    const dnsHealthCheck = new cdk.aws_route53.CfnHealthCheck(this, "HealthCheck", {
      healthCheckConfig: {
        type: "HTTP",
        fullyQualifiedDomainName: props.nlb.loadBalancerDnsName,
        port: 80,
        resourcePath: "/",
        requestInterval: 10,
        failureThreshold: 3,
        measureLatency: false,
      },
      healthCheckTags: [
        {
          key: "Name",
          value: `${props.serviceName}-${props.area}-healthcheck`,
        },
      ],
    });
    dnsHealthCheck.node.addDependency(props.nlb);

    // A record for DNS failover
    const nlbARecord = new cdk.aws_route53.CfnRecordSet(this, "RecordSet", {
      name: props.globalDomainName,
      type: cdk.aws_route53.RecordType.A,
      aliasTarget: {
        dnsName: props.nlb.loadBalancerDnsName,
        hostedZoneId: props.nlb.loadBalancerCanonicalHostedZoneId,
        evaluateTargetHealth: true,
      },
      failover: props.failoverType,
      healthCheckId: dnsHealthCheck.attrHealthCheckId,
      hostedZoneId: props.hostedZone.hostedZoneId,
      setIdentifier: `${props.serviceName}-${props.area}-id`,
    });
    nlbARecord.node.addDependency(dnsHealthCheck);
  }
}
