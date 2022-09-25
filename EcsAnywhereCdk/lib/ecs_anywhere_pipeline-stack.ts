import * as codebuild from 'aws-cdk-lib/aws-codebuild';
import * as codepipeline from 'aws-cdk-lib/aws-codepipeline';
import { CodePipeline, CodePipelineSource, ShellStep } from 'aws-cdk-lib/pipelines';
import * as codepipeline_actions from 'aws-cdk-lib/aws-codepipeline-actions';
import * as codecommit from 'aws-cdk-lib/aws-codecommit';
import * as ec2 from 'aws-cdk-lib/aws-ec2';
import * as ecs from 'aws-cdk-lib/aws-ecs';
import * as cdk from 'aws-cdk-lib';
import { Construct } from 'constructs';
import { Duration, RemovalPolicy, Stack, StackProps } from 'aws-cdk-lib';
import { BuildSpec } from 'aws-cdk-lib/aws-codebuild';
import * as ecr from 'aws-cdk-lib/aws-ecr';
import * as iam from 'aws-cdk-lib/aws-iam';
import * as s3 from 'aws-cdk-lib/aws-s3';
import * as kms from 'aws-cdk-lib/aws-kms';
import { Service } from 'aws-cdk-lib/aws-servicediscovery';

interface EcsStackProps extends cdk.StackProps {
  service: ecs.ExternalService;
  repo: codecommit.Repository;
}

export class EcsAnywherePipelineStack extends cdk.Stack {
  AppUiRepo: any;

  constructor(scope: cdk.App, id: string, props: EcsStackProps) {
    super(scope, id, props);
    // constants
    const dockerBuildOutput = new codepipeline.Artifact("DockerBuildOutput");
    const outputWebApp = new codepipeline.Artifact();
    const sourceOutput = new codepipeline.Artifact();

    const sourceAction = new codepipeline_actions.CodeCommitSourceAction({
      actionName: 'Source_Checkout',
      repository: props.repo,
      output: sourceOutput,
      trigger: codepipeline_actions.CodeCommitTrigger.POLL,
      branch: 'main',
    });

    // create ECR repo
    this.AppUiRepo = new ecr.Repository(this, 'EcrAppRepo', {
      repositoryName: 'app-ecr-repo',
      imageScanOnPush: true,
    });
    this.AppUiRepo.applyRemovalPolicy(RemovalPolicy.DESTROY)

    // create build project
    const dockerBuild = new codebuild.PipelineProject(this, 'ApplicationDockerBuild', {
      projectName: 'AppDockerbuild',
      environment: {
        buildImage: codebuild.LinuxBuildImage.AMAZON_LINUX_2_3,
        privileged: true,
      },
      buildSpec: codebuild.BuildSpec.fromSourceFilename(
        "application/buildspec.yml"
      ),

      environmentVariables: {
        'IMAGE_REPO_NAME': {
          value: this.AppUiRepo.repositoryName
        },
        'IMAGE_REPO_URI': {
          value: this.AppUiRepo.repositoryUri
        }
      }
    });



    const myKmsKey = new kms.Key(this, 'MyKey',{
      enableKeyRotation : true,
      enabled: true
    });

    const myArtifactBucket = new s3.Bucket(this, 'Bucket', {
      // possibly pass a Key, maybe with an Alias, here?
      encryption: s3.BucketEncryption.KMS,
      bucketKeyEnabled: true,
      enforceSSL: true,
      encryptionKey: myKmsKey,
    });

    new codepipeline.Pipeline(this, 'Pipeline', {
      pipelineName: 'EcsAnywherePipeline',
      artifactBucket: myArtifactBucket,
      stages: [
        {
          stageName: "Source_Checkout",
          actions: [sourceAction],
        },
        {
          stageName: 'Build',
          actions: [
            new codepipeline_actions.CodeBuildAction({
              actionName: 'DockerBuild',
              project: dockerBuild,
              input: sourceOutput,
              outputs: [dockerBuildOutput],
            
            }
            )
          ]
        },
        {
          stageName: 'Deploy',
          actions: [
            new codepipeline_actions.EcsDeployAction({
              actionName: 'DeployImage',
              service: props.service,
              // input: dockerBuildOutput,
              imageFile: dockerBuildOutput.atPath('application/images.json'),
              deploymentTimeout: Duration.minutes(10),
            })
          ]
        }
      ],
    });

    this.AppUiRepo.grantPullPush(dockerBuild);
  }
}

function dockerBuild(dockerBuild: any) {
  throw new Error('Function not implemented.');
}
