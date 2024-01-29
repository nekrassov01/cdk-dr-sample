import * as cdk from "aws-cdk-lib";
import { Stack, StackProps } from "aws-cdk-lib";
import { Construct } from "constructs";
import { Accepter, Requester } from "./constructs/peering";

export interface DrSamplePeeringStackProps extends StackProps {
  serviceName: string;
  area: "tokyo" | "osaka";
  vpcPrimary: cdk.aws_ec2.IVpc;
  vpcSecondary: cdk.aws_ec2.IVpc;
  peerRegion: string;
  connection: cdk.aws_ec2.CfnVPCPeeringConnection | undefined;
}

export class DrSamplePeeringStack extends Stack {
  public readonly connection: cdk.aws_ec2.CfnVPCPeeringConnection | undefined;

  constructor(scope: Construct, id: string, props: DrSamplePeeringStackProps) {
    super(scope, id, props);

    if (props.area === "tokyo") {
      const connection = new Requester(this, "PeeringRequester", {
        serviceName: props.serviceName,
        vpcPrimary: props.vpcPrimary,
        vpcSecondary: props.vpcSecondary,
        peerRegion: props.peerRegion,
      });
      this.connection = connection.vpcPeeringConnection;
    } else if (props.area === "osaka") {
      new Accepter(this, "PeeringAccepter", {
        serviceName: props.serviceName,
        vpcPrimary: props.vpcPrimary,
        vpcSecondary: props.vpcSecondary,
        connection: props.connection,
      });
      this.connection = undefined;
    }
  }
}
