#!/usr/bin/env node
import { App, Tags } from "aws-cdk-lib";
import "source-map-support/register";
import { DrSampleAcceleratorStack } from "../lib/accelerator-stack";
import { DrSampleResourceStack } from "../lib/resource-stack";

const app = new App();

// Get context
const owner = app.node.tryGetContext("owner");
const serviceName = app.node.tryGetContext("serviceName");
const hostedZoneName = app.node.tryGetContext("hostedZoneName");

// Deploy tokyo stack
const tokyoStack = new DrSampleResourceStack(app, "DrSampleResourceStackTokyo", {
  env: {
    account: process.env.CDK_DEFAULT_ACCOUNT,
    region: "ap-northeast-1",
  },
  terminationProtection: false,
  crossRegionReferences: true,
  serviceName: serviceName,
  azA: "ap-northeast-1a",
  azC: "ap-northeast-1c",
  area: "tokyo",
  hostedZoneName: hostedZoneName,
  globalDomainName: `${serviceName}-${hostedZoneName}`,
  regionalDomainName: `${serviceName}-tokyo-${hostedZoneName}`,
  userDataFilePath: "./src/ec2/userdata-ap-northeast-1.sh",
});

// Deploy osaka stack
const osakaStack = new DrSampleResourceStack(app, "DrSampleResourceStackOsaka", {
  env: {
    account: process.env.CDK_DEFAULT_ACCOUNT,
    region: "ap-northeast-3",
  },
  terminationProtection: false,
  crossRegionReferences: true,
  serviceName: serviceName,
  azA: "ap-northeast-3a",
  azC: "ap-northeast-3c",
  area: "osaka",
  hostedZoneName: hostedZoneName,
  globalDomainName: `${serviceName}-${hostedZoneName}`,
  regionalDomainName: `${serviceName}-osaka-${hostedZoneName}`,
  userDataFilePath: "./src/ec2/userdata-ap-northeast-3.sh",
});

// Global Accelerator
const gaStack = new DrSampleAcceleratorStack(app, "DrSampleAcceleratorStack", {
  env: {
    account: process.env.CDK_DEFAULT_ACCOUNT,
    region: process.env.CDK_DEFAULT_REGION,
  },
  terminationProtection: false,
  crossRegionReferences: true,
  serviceName: serviceName,
  hostedZoneName: hostedZoneName,
  globalDomainName: `${serviceName}-${hostedZoneName}`,
  alb1: tokyoStack.alb,
  alb2: osakaStack.alb,
});

// Add dependency
gaStack.addDependency(tokyoStack);
gaStack.addDependency(osakaStack);

// Tagging all resources
Tags.of(app).add("Owner", owner);
