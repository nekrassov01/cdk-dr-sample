#!/usr/bin/env node
import "source-map-support/register";
import { App, Tags } from "aws-cdk-lib";
import { DrSampleResourceStack } from "../lib/resource-stack";
import { DrSampleAcceleratorStack } from "../lib/accelerator-stack";

// Get parameters from context
const app = new App();
const serviceName = app.node.tryGetContext("serviceName");
const hostedZoneName = app.node.tryGetContext("hostedZoneName");

// Deploy main stack
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
  userDataFilePath: "./src/ec2/userdata-ap-northeast-1.sh",
});

// Deploy DR stack
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
  userDataFilePath: "./src/ec2/userdata-ap-northeast-3.sh",
});

// Global Accelerator
const gaStack = new DrSampleAcceleratorStack(app, "DrSampleAcceleratorStack", {
  env: {
    account: process.env.CDK_DEFAULT_ACCOUNT,
    region: "ap-northeast-1",
  },
  terminationProtection: false,
  crossRegionReferences: true,
  serviceName: serviceName,
  hostedZoneName: hostedZoneName,
  alb1: tokyoStack.alb,
  alb2: osakaStack.alb,
});

// Add dependency
gaStack.addDependency(tokyoStack);
gaStack.addDependency(osakaStack);

// Tagging all resources
Tags.of(app).add("Owner", "kawashima");
