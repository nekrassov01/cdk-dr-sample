#!/usr/bin/env node
import { App, Tags } from "aws-cdk-lib";
import "source-map-support/register";
import { DrSampleDNSStack } from "../lib/dns-stack";
import { DrSampleResourceStack } from "../lib/resource-stack";

const app = new App();

// Get context
const owner = app.node.tryGetContext("owner");
const serviceName = app.node.tryGetContext("serviceName");
const hostedZoneName = app.node.tryGetContext("hostedZoneName");

// Deploy tokyo stack
const tokyoStack = new DrSampleResourceStack(app, "DrSampleNLBStackTokyo", {
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
});

// Deploy osaka stack
const osakaStack = new DrSampleResourceStack(app, "DrSampleNLBStackOsaka", {
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
});

// DNS
const dnsStack = new DrSampleDNSStack(app, "DrSampleDNSStack", {
  env: {
    account: process.env.CDK_DEFAULT_ACCOUNT,
    region: process.env.CDK_DEFAULT_REGION,
  },
  terminationProtection: false,
  crossRegionReferences: true,
  hostedZoneName: hostedZoneName,
  globalDomainName: `${serviceName}.${hostedZoneName}`,
  nlb: tokyoStack.nlb,
});

// Add dependency
dnsStack.addDependency(tokyoStack);
dnsStack.addDependency(osakaStack);

// Tagging all resources
Tags.of(app).add("Owner", owner);
