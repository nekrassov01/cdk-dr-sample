#!/usr/bin/env node
import { App, Tags } from "aws-cdk-lib";
import "source-map-support/register";
import { DrSampleResourceStack } from "../lib/resource-stack";

const app = new App();

// Get context
const owner = app.node.tryGetContext("owner");
const serviceName = app.node.tryGetContext("serviceName");
const hostedZoneName = app.node.tryGetContext("hostedZoneName");

// Deploy tokyo stack
new DrSampleResourceStack(app, "DrSampleResourceStackTokyo", {
  env: {
    account: process.env.CDK_DEFAULT_ACCOUNT,
    region: "ap-northeast-1",
  },
  terminationProtection: false,
  crossRegionReferences: true,
  serviceName: serviceName,
  azPrimary: "ap-northeast-1a",
  azSecondary: "ap-northeast-1c",
  area: "tokyo",
  hostedZoneName: hostedZoneName,
  globalDomainName: `${serviceName}.${hostedZoneName}`,
  userDataFilePath: "./src/ec2/userdata-tokyo.sh",
  failoverType: "PRIMARY",
});

// Deploy osaka stack
new DrSampleResourceStack(app, "DrSampleResourceStackOsaka", {
  env: {
    account: process.env.CDK_DEFAULT_ACCOUNT,
    region: "ap-northeast-3",
  },
  terminationProtection: false,
  crossRegionReferences: true,
  serviceName: serviceName,
  azPrimary: "ap-northeast-3a",
  azSecondary: "ap-northeast-3c",
  area: "osaka",
  hostedZoneName: hostedZoneName,
  globalDomainName: `${serviceName}.${hostedZoneName}`,
  userDataFilePath: "./src/ec2/userdata-osaka.sh",
  failoverType: "SECONDARY",
});

// Tagging all resources
Tags.of(app).add("Owner", owner);
