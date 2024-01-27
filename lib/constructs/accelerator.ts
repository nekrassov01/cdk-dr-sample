import * as cdk from "aws-cdk-lib";
import { Construct } from "constructs";

export interface AcceleratorProps {
  serviceName: string;
  globalDomainName: string;
  hostedZone: cdk.aws_route53.IHostedZone;
  albPrimary: cdk.aws_elasticloadbalancingv2.IApplicationLoadBalancer;
  albSecondary: cdk.aws_elasticloadbalancingv2.IApplicationLoadBalancer;
}

export class Accelerator extends Construct {
  constructor(scope: Construct, id: string, props: AcceleratorProps) {
    super(scope, id);

    // Global Accelerator
    const accelerator = new cdk.aws_globalaccelerator.Accelerator(this, "GlobalAccelerator", {
      acceleratorName: `${props.serviceName}-accelerator`,
      enabled: true,
      ipAddressType: cdk.aws_globalaccelerator.IpAddressType.IPV4,
    });
    accelerator.applyRemovalPolicy(cdk.RemovalPolicy.DESTROY);

    // Listener
    const listener = accelerator.addListener("GlobalAcceleratorListener", {
      listenerName: `${props.serviceName}-accelerator-listener`,
      protocol: cdk.aws_globalaccelerator.ConnectionProtocol.TCP,
      portRanges: [{ fromPort: 443 }],
      clientAffinity: cdk.aws_globalaccelerator.ClientAffinity.SOURCE_IP,
    });
    listener.applyRemovalPolicy(cdk.RemovalPolicy.DESTROY);

    // Endpoint group for ALB 1
    listener.addEndpointGroup("GlobalAcceleratorEndpointGroup1", {
      endpoints: [
        new cdk.aws_globalaccelerator_endpoints.ApplicationLoadBalancerEndpoint(props.albPrimary, {
          weight: 128,
          preserveClientIp: true,
        }),
      ],
      trafficDialPercentage: 100,
    });

    // Endpoint group for ALB 2
    listener.addEndpointGroup("GlobalAcceleratorEndpointGroup2", {
      endpoints: [
        new cdk.aws_globalaccelerator_endpoints.ApplicationLoadBalancerEndpoint(props.albSecondary, {
          weight: 128,
          preserveClientIp: true,
        }),
      ],
      trafficDialPercentage: 0,
    });

    // Alias record for Global Accelerator
    const gaARecord = new cdk.aws_route53.ARecord(this, "Route53GlobalAcceleratorARecord", {
      recordName: props.globalDomainName,
      target: cdk.aws_route53.RecordTarget.fromAlias(new cdk.aws_route53_targets.GlobalAcceleratorTarget(accelerator)),
      zone: props.hostedZone,
    });
    gaARecord.node.addDependency(accelerator);
  }
}
