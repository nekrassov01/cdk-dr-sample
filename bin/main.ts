#!/usr/bin/env node
import { App, Tags } from "aws-cdk-lib";
import "source-map-support/register";
import { DrSamplePeeringStack } from "../lib/peering-stack";
import { DrSampleRegionalStack } from "../lib/regional-stack";

const app = new App();

// Get context
const owner = app.node.tryGetContext("owner");
const serviceName = app.node.tryGetContext("serviceName");
const hostedZoneName = app.node.tryGetContext("hostedZoneName");
const globalDomainName = `${serviceName}.${hostedZoneName}`;
const globalDatabaseIdentifier = `${serviceName}-global-database`;

// Deploy tokyo stack
const tokyoStack = new DrSampleRegionalStack(app, "DrSampleRegionalStackTokyo", {
  env: {
    account: process.env.CDK_DEFAULT_ACCOUNT,
    region: "ap-northeast-1",
  },
  terminationProtection: false,
  serviceName: serviceName,
  area: "tokyo",
  cidr: "10.0.0.0/16",
  azPrimary: "ap-northeast-1a",
  azSecondary: "ap-northeast-1c",
  globalDatabaseIdentifier: globalDatabaseIdentifier,
  isPrimaryDatabaseCluster: true,
  hostedZoneName: hostedZoneName,
  globalDomainName: globalDomainName,
  userDataFilePath: "./src/ec2/userdata-tokyo.sh",
  failoverType: "PRIMARY",
});

// Deploy osaka stack
const osakaStack = new DrSampleRegionalStack(app, "DrSampleRegionalStackOsaka", {
  env: {
    account: process.env.CDK_DEFAULT_ACCOUNT,
    region: "ap-northeast-3",
  },
  terminationProtection: false,
  serviceName: serviceName,
  area: "osaka",
  cidr: "10.1.0.0/16",
  azPrimary: "ap-northeast-3a",
  azSecondary: "ap-northeast-3c",
  globalDatabaseIdentifier: globalDatabaseIdentifier,
  isPrimaryDatabaseCluster: false,
  hostedZoneName: hostedZoneName,
  globalDomainName: globalDomainName,
  userDataFilePath: "./src/ec2/userdata-osaka.sh",
  failoverType: "SECONDARY",
});

// Deploy stack for VPC peering tokyo side
const tokyoPeeringStack = new DrSamplePeeringStack(app, "DrSamplePeeringStackTokyo", {
  env: {
    account: process.env.CDK_DEFAULT_ACCOUNT,
    region: "ap-northeast-1",
  },
  terminationProtection: false,
  crossRegionReferences: true,
  serviceName: serviceName,
  area: "tokyo",
  vpcPrimary: tokyoStack.vpc,
  vpcSecondary: osakaStack.vpc,
  peerRegion: osakaStack.region,
  connection: undefined,
});

// Deploy stack for VPC peering osaka side
new DrSamplePeeringStack(app, "DrSamplePeeringStackOsaka", {
  env: {
    account: process.env.CDK_DEFAULT_ACCOUNT,
    region: "ap-northeast-3",
  },
  terminationProtection: false,
  crossRegionReferences: true,
  serviceName: serviceName,
  area: "osaka",
  vpcPrimary: tokyoStack.vpc,
  vpcSecondary: osakaStack.vpc,
  peerRegion: osakaStack.region,
  connection: tokyoPeeringStack.connection,
});

// Tagging all resources
Tags.of(app).add("Owner", owner);
