import { Duration, RemovalPolicy, Stack, StackProps } from "aws-cdk-lib";
import { ApplicationLoadBalancer } from "aws-cdk-lib/aws-elasticloadbalancingv2";
import { Accelerator, ClientAffinity, ConnectionProtocol, IpAddressType } from "aws-cdk-lib/aws-globalaccelerator";
import { ApplicationLoadBalancerEndpoint } from "aws-cdk-lib/aws-globalaccelerator-endpoints";
import { ARecord, HostedZone, RecordTarget } from "aws-cdk-lib/aws-route53";
import { GlobalAcceleratorTarget } from "aws-cdk-lib/aws-route53-targets";
import { Construct } from "constructs";

export interface DrSampleAcceleratorStackProps extends StackProps {
  serviceName: string;
  hostedZoneName: string;
  globalDomainName: string;
  alb1: ApplicationLoadBalancer;
  alb2: ApplicationLoadBalancer;
}

export class DrSampleAcceleratorStack extends Stack {
  constructor(scope: Construct, id: string, props: DrSampleAcceleratorStackProps) {
    super(scope, id, props);

    const { serviceName, hostedZoneName, globalDomainName, alb1, alb2 } = props;

    // Hosted zone
    const hostedZone = HostedZone.fromLookup(this, "Route53HostedZone", {
      domainName: hostedZoneName,
    });

    // Global Accelerator
    const accelerator = new Accelerator(this, "GlobalAccelerator", {
      acceleratorName: `${serviceName}-accelerator`,
      enabled: true,
      ipAddressType: IpAddressType.IPV4,
    });
    accelerator.applyRemovalPolicy(RemovalPolicy.DESTROY);

    // Listener
    const listener = accelerator.addListener("GlobalAcceleratorListener", {
      listenerName: `${serviceName}-accelerator-listener`,
      protocol: ConnectionProtocol.TCP,
      portRanges: [{ fromPort: 443 }],
      clientAffinity: ClientAffinity.SOURCE_IP,
    });
    listener.applyRemovalPolicy(RemovalPolicy.DESTROY);

    // Endpoint group for ALB 1
    listener.addEndpointGroup("GlobalAcceleratorEndpointGroup1", {
      endpoints: [
        new ApplicationLoadBalancerEndpoint(alb1, {
          weight: 255,
          preserveClientIp: true,
        }),
      ],
      trafficDialPercentage: 100,
      healthCheckInterval: Duration.seconds(10),
    });

    // Endpoint group for ALB 2
    listener.addEndpointGroup("GlobalAcceleratorEndpointGroup2", {
      endpoints: [
        new ApplicationLoadBalancerEndpoint(alb2, {
          weight: 0,
          preserveClientIp: true,
        }),
      ],
      trafficDialPercentage: 100,
      healthCheckInterval: Duration.seconds(10),
    });

    // Alias record for Global Accelerator
    const gaARecord = new ARecord(this, "Route53GlobalAcceleratorARecord", {
      recordName: globalDomainName,
      target: RecordTarget.fromAlias(new GlobalAcceleratorTarget(accelerator)),
      zone: hostedZone,
    });
    gaARecord.node.addDependency(accelerator);
  }
}
