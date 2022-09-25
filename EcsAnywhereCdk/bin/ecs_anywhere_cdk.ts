#!/usr/bin/env node
import 'source-map-support/register';
import * as cdk from 'aws-cdk-lib';
import { EcsAnywhereCdkStack } from '../lib/ecs_anywhere_cdk-stack';
import { EcsAnywherePipelineStack } from '../lib/ecs_anywhere_pipeline-stack';

const app = new cdk.App();

const CdkInfraStack = new EcsAnywhereCdkStack(app, 'EcsAnywhereInfraStack', {
});

const CdkPipelineStack = new EcsAnywherePipelineStack(app, 'EcsAnywherePipelineStack', {
  service: CdkInfraStack.service,
  repo: CdkInfraStack.repo,
});
