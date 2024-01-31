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
    const accelerator = new cdk.aws_globalaccelerator.Accelerator(this, "Accelerator", {
      acceleratorName: `${props.serviceName}-accelerator`,
      enabled: true,
      ipAddressType: cdk.aws_globalaccelerator.IpAddressType.IPV4,
    });
    accelerator.applyRemovalPolicy(cdk.RemovalPolicy.DESTROY);

    // Endpoint for primary ALB
    const albPrimary = new cdk.aws_globalaccelerator_endpoints.ApplicationLoadBalancerEndpoint(props.albPrimary, {
      weight: 128,
      preserveClientIp: true,
    });

    // Endpoint for secondary ALB
    const albSecondary = new cdk.aws_globalaccelerator_endpoints.ApplicationLoadBalancerEndpoint(props.albSecondary, {
      weight: 128,
      preserveClientIp: true,
    });

    // Listener for HTTPS
    const listenerHTTPS = accelerator.addListener("ListenerHTTPS", {
      protocol: cdk.aws_globalaccelerator.ConnectionProtocol.TCP,
      portRanges: [{ fromPort: 443, toPort: 443 }],
      clientAffinity: cdk.aws_globalaccelerator.ClientAffinity.SOURCE_IP,
    });
    listenerHTTPS.applyRemovalPolicy(cdk.RemovalPolicy.DESTROY);

    // Add primary ALB to endpoint group for HTTPS listener
    listenerHTTPS.addEndpointGroup("EndpointGroup1", {
      endpoints: [albPrimary],
      trafficDialPercentage: 100,
    });

    // Add secondary ALB to endpoint group for HTTPS listener
    listenerHTTPS.addEndpointGroup("EndpointGroup2", {
      endpoints: [albSecondary],
      trafficDialPercentage: 0,
    });

    // Listener for HTTP
    const listenerHTTP = accelerator.addListener("ListenerHTTP", {
      protocol: cdk.aws_globalaccelerator.ConnectionProtocol.TCP,
      portRanges: [{ fromPort: 80, toPort: 80 }],
      clientAffinity: cdk.aws_globalaccelerator.ClientAffinity.SOURCE_IP,
    });
    listenerHTTP.applyRemovalPolicy(cdk.RemovalPolicy.DESTROY);

    // Add primary ALB to endpoint group for HTTP listener
    listenerHTTP.addEndpointGroup("EndpointGroup1", {
      endpoints: [albPrimary],
      trafficDialPercentage: 100,
    });

    // Add secondary ALB to endpoint group for HTTP listener
    listenerHTTP.addEndpointGroup("EndpointGroup2", {
      endpoints: [albSecondary],
      trafficDialPercentage: 0,
    });

    // Alias record for Global Accelerator
    const gaARecord = new cdk.aws_route53.ARecord(this, "ARecord", {
      recordName: props.globalDomainName,
      target: cdk.aws_route53.RecordTarget.fromAlias(new cdk.aws_route53_targets.GlobalAcceleratorTarget(accelerator)),
      zone: props.hostedZone,
    });
    gaARecord.node.addDependency(accelerator);
  }
}
