import * as cdk from "aws-cdk-lib";
import { Construct } from "constructs";

// Function for create route to VPC peering connection
const createRoutes = (
  scope: Construct,
  area: "Tokyo" | "Osaka",
  targetCidrBlock: string,
  subnets: cdk.aws_ec2.ISubnet[],
  subnetType: "Public" | "Private" | "Isolated",
  connection: cdk.aws_ec2.CfnVPCPeeringConnection
) => {
  subnets.forEach((subnet: cdk.aws_ec2.ISubnet, index: number) => {
    new cdk.aws_ec2.CfnRoute(scope, `VpcRoute${area}${subnetType}${index}`, {
      routeTableId: subnet.routeTable.routeTableId,
      destinationCidrBlock: targetCidrBlock,
      vpcPeeringConnectionId: cdk.Token.asString(connection.attrId),
    });
  });
};

export interface RequesterProps {
  serviceName: string;
  vpcPrimary: cdk.aws_ec2.IVpc;
  vpcSecondary: cdk.aws_ec2.IVpc;
  peerRegion: string;
}

export class Requester extends Construct {
  public readonly vpcPeeringConnection: cdk.aws_ec2.CfnVPCPeeringConnection;

  constructor(scope: Construct, id: string, props: RequesterProps) {
    super(scope, id);

    // VPC peering connection
    this.vpcPeeringConnection = new cdk.aws_ec2.CfnVPCPeeringConnection(this, "PeeringConnection", {
      vpcId: props.vpcPrimary.vpcId,
      peerVpcId: props.vpcSecondary.vpcId,
      peerRegion: props.peerRegion,
    });
    cdk.Tags.of(this.vpcPeeringConnection).add("Name", `${props.serviceName}-peering-connection`);

    createRoutes(
      this,
      "Tokyo",
      props.vpcSecondary.vpcCidrBlock,
      props.vpcPrimary.publicSubnets,
      "Public",
      this.vpcPeeringConnection
    );
    createRoutes(
      this,
      "Tokyo",
      props.vpcSecondary.vpcCidrBlock,
      props.vpcPrimary.privateSubnets,
      "Private",
      this.vpcPeeringConnection
    );
    createRoutes(
      this,
      "Tokyo",
      props.vpcSecondary.vpcCidrBlock,
      props.vpcPrimary.isolatedSubnets,
      "Isolated",
      this.vpcPeeringConnection
    );
  }
}

export interface AccepterProps {
  serviceName: string;
  vpcPrimary: cdk.aws_ec2.IVpc;
  vpcSecondary: cdk.aws_ec2.IVpc;
  connection: cdk.aws_ec2.CfnVPCPeeringConnection | undefined;
}

export class Accepter extends Construct {
  constructor(scope: Construct, id: string, props: AccepterProps) {
    super(scope, id);

    cdk.Tags.of(props.connection!).add("Name", `${props.serviceName}-peering-connection`);

    createRoutes(
      this,
      "Osaka",
      props.vpcPrimary.vpcCidrBlock,
      props.vpcSecondary.publicSubnets,
      "Public",
      props.connection!
    );
    createRoutes(
      this,
      "Osaka",
      props.vpcPrimary.vpcCidrBlock,
      props.vpcSecondary.privateSubnets,
      "Private",
      props.connection!
    );
    createRoutes(
      this,
      "Osaka",
      props.vpcPrimary.vpcCidrBlock,
      props.vpcSecondary.isolatedSubnets,
      "Isolated",
      props.connection!
    );
  }
}
