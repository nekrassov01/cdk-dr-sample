#!/usr/bin/env node
import "source-map-support/register";
import { App, Tags } from "aws-cdk-lib";
import { DrSampleStack } from "../lib/cdk-dr-sample-stack";

// Get parameters from context
const app = new App();
const serviceName = app.node.tryGetContext("serviceName");
const hostedZoneName = app.node.tryGetContext("hostedZoneName");

// Deploy main stack
new DrSampleStack(app, "DrSampleStackTokyo", {
  env: {
    account: process.env.CDK_DEFAULT_ACCOUNT,
    region: "ap-northeast-1",
  },
  terminationProtection: false,
  serviceName: serviceName,
  area: "tokyo",
  hostedZoneName: hostedZoneName,
  userDataFilePath: "./src/ec2/userdata-ap-northeast-1.sh",
  azA: "ap-northeast-1a",
  azB: "ap-northeast-1c",
});

// Deploy DR stack
new DrSampleStack(app, "DrSampleStackOsaka", {
  env: {
    account: process.env.CDK_DEFAULT_ACCOUNT,
    region: "ap-northeast-3",
  },
  terminationProtection: false,
  serviceName: serviceName,
  area: "osaka",
  hostedZoneName: hostedZoneName,
  userDataFilePath: "./src/ec2/userdata-ap-northeast-3.sh",
  azA: "ap-northeast-3a",
  azB: "ap-northeast-3c",
});

// Tagging all resources
Tags.of(app).add("Owner", "kawashima");
