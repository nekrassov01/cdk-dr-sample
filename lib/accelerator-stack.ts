import { RemovalPolicy, Stack, StackProps } from "aws-cdk-lib";
import { ApplicationLoadBalancer } from "aws-cdk-lib/aws-elasticloadbalancingv2";
import { Accelerator, ClientAffinity, ConnectionProtocol, IpAddressType } from "aws-cdk-lib/aws-globalaccelerator";
import { ApplicationLoadBalancerEndpoint } from "aws-cdk-lib/aws-globalaccelerator-endpoints";
import { ARecord, HostedZone, RecordTarget } from "aws-cdk-lib/aws-route53";
import { GlobalAcceleratorTarget } from "aws-cdk-lib/aws-route53-targets";
import { Construct } from "constructs";

export interface DrSampleAcceleratorStackProps extends StackProps {
  serviceName: string;
  hostedZoneName: string;
  alb1: ApplicationLoadBalancer;
  alb2: ApplicationLoadBalancer;
}

export class DrSampleAcceleratorStack extends Stack {
  constructor(scope: Construct, id: string, props: DrSampleAcceleratorStackProps) {
    super(scope, id, props);

    const { serviceName, hostedZoneName, alb1, alb2 } = props;

    // Domain name
    const globalDomainName = `${serviceName}.${hostedZoneName}`;

    // Hosted zone
    const hostedZone = HostedZone.fromLookup(this, "HostedZone", {
      domainName: hostedZoneName,
    });

    // Global Accelerator
    const accelerator = new Accelerator(this, "Accelerator", {
      acceleratorName: `${serviceName}-accelerator`,
      enabled: true,
      ipAddressType: IpAddressType.IPV4,
    });
    accelerator.applyRemovalPolicy(RemovalPolicy.DESTROY);

    // Listener
    const listener = accelerator.addListener("Listener", {
      listenerName: `${serviceName}-accelerator-listener`,
      protocol: ConnectionProtocol.TCP,
      portRanges: [{ fromPort: 443 }],
      clientAffinity: ClientAffinity.SOURCE_IP,
    });
    listener.applyRemovalPolicy(RemovalPolicy.DESTROY);

    // Endpoint group for ALB 1
    listener.addEndpointGroup("EndpointGroup1", {
      endpoints: [
        new ApplicationLoadBalancerEndpoint(
          ApplicationLoadBalancer.fromApplicationLoadBalancerAttributes(this, "ALB1", {
            loadBalancerArn: alb1.loadBalancerArn,
            securityGroupId: alb1.loadBalancerSecurityGroups[0],
          }),
          {
            weight: 128,
            preserveClientIp: true,
          }
        ),
      ],
      trafficDialPercentage: 100,
    });

    // Endpoint group for ALB 2
    listener.addEndpointGroup("EndpointGroup2", {
      endpoints: [
        new ApplicationLoadBalancerEndpoint(
          ApplicationLoadBalancer.fromApplicationLoadBalancerAttributes(this, "ALB2", {
            loadBalancerArn: alb2.loadBalancerArn,
            securityGroupId: alb2.loadBalancerSecurityGroups[0],
          }),
          {
            weight: 128,
            preserveClientIp: true,
          }
        ),
      ],
      trafficDialPercentage: 0,
    });

    // Alias record for Global Accelerator
    const gaARecord = new ARecord(this, "GlobalAcceleratorARecord", {
      recordName: globalDomainName,
      target: RecordTarget.fromAlias(new GlobalAcceleratorTarget(accelerator)),
      zone: hostedZone,
    });
    gaARecord.node.addDependency(accelerator);
  }
}
