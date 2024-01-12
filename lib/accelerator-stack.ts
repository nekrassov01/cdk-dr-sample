import {
  RemovalPolicy,
  Stack,
  StackProps,
  aws_elasticloadbalancingv2 as elbv2,
  aws_globalaccelerator as ga,
  aws_globalaccelerator_endpoints as ga_endpoints,
  aws_route53 as route53,
  aws_route53_targets as route53_targets,
} from "aws-cdk-lib";
import { Construct } from "constructs";

export interface DrSampleAcceleratorStackProps extends StackProps {
  serviceName: string;
  hostedZoneName: string;
  alb1: elbv2.ApplicationLoadBalancer;
  alb2: elbv2.ApplicationLoadBalancer;
}

export class DrSampleAcceleratorStack extends Stack {
  constructor(scope: Construct, id: string, props: DrSampleAcceleratorStackProps) {
    super(scope, id, props);

    const { serviceName, hostedZoneName, alb1, alb2 } = props;

    // Domain name
    const globalDomainName = `${serviceName}.${hostedZoneName}`;

    // Hosted zone
    const hostedZone = route53.HostedZone.fromLookup(this, "HostedZone", {
      domainName: hostedZoneName,
    });

    // Global Accelerator
    const accelerator = new ga.Accelerator(this, "Accelerator", {
      acceleratorName: `${serviceName}-accelerator`,
      enabled: true,
      ipAddressType: ga.IpAddressType.IPV4,
    });
    accelerator.applyRemovalPolicy(RemovalPolicy.DESTROY);

    // Listener
    const listener = accelerator.addListener("Listener", {
      listenerName: `${serviceName}-accelerator-listener`,
      protocol: ga.ConnectionProtocol.TCP,
      portRanges: [{ fromPort: 443 }],
      clientAffinity: ga.ClientAffinity.SOURCE_IP,
    });
    listener.applyRemovalPolicy(RemovalPolicy.DESTROY);

    // Endpoint group for ALB 1
    listener.addEndpointGroup("EndpointGroup1", {
      endpoints: [
        new ga_endpoints.ApplicationLoadBalancerEndpoint(
          elbv2.ApplicationLoadBalancer.fromApplicationLoadBalancerAttributes(this, "ALB1", {
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
        new ga_endpoints.ApplicationLoadBalancerEndpoint(
          elbv2.ApplicationLoadBalancer.fromApplicationLoadBalancerAttributes(this, "ALB2", {
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
    const gaARecord = new route53.ARecord(this, "GlobalAcceleratorARecord", {
      recordName: globalDomainName,
      target: route53.RecordTarget.fromAlias(new route53_targets.GlobalAcceleratorTarget(accelerator)),
      zone: hostedZone,
    });
    gaARecord.node.addDependency(accelerator);
  }
}
