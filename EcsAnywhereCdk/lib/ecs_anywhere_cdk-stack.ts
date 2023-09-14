import { Stack, StackProps } from 'aws-cdk-lib';
import { Construct } from 'constructs';
import * as ec2 from 'aws-cdk-lib/aws-ec2';
import * as ecs from 'aws-cdk-lib/aws-ecs';
import * as iam from 'aws-cdk-lib/aws-iam';
import { CfnOutput } from 'aws-cdk-lib';
import * as codecommit from 'aws-cdk-lib/aws-codecommit';
import { ManagedPolicy } from 'aws-cdk-lib/aws-iam';
import { NagSuppressions } from 'cdk-nag';

export class EAnywhereCdkStack extends Stack {
  public readonly service: ecs.ExternalService;
  public readonly repo: codecommit.Repository;

  constructor(scope: Construct, id: string, props?: StackProps) {
    super(scope, id, props);

    // Create coderepo
    this.repo = new codecommit.Repository(this, 'EcsAnywherePipeline', {
      repositoryName: "EcsAnywhereRepo",
      description: "CDK and Sample Application Codebase repo",
    });

    // Create VPC
    const vpc = new ec2.Vpc(this, 'EcsAnywhereVPC', {
      ipAddresses: ec2.IpAddresses.cidr('192.168.0.0/16'),
      vpcName: 'EcsAnywhereVpc',
      subnetConfiguration: [
        {
          cidrMask: 24,
          name: 'PrivateSubnet',
          subnetType: ec2.SubnetType.PRIVATE_WITH_EGRESS,
        },
        {
          subnetType: ec2.SubnetType.PUBLIC,
          name: 'EcsAnywherePublic',
          cidrMask: 24,
        },
      ]
    });
    NagSuppressions.addResourceSuppressions(vpc,[{id: 'AwsSolutions-VPC7', reason: 'lorem ipsum'}])
    // Create ECS cluster
    const ecsAnywhereCluster = new ecs.Cluster(this, 'EcsAnywhereCluster', {
      vpc,
      clusterName: "EcsAnywhereCluster",
    });
    NagSuppressions.addResourceSuppressions(ecsAnywhereCluster,[{id: 'AwsSolutions-ECS4', reason: 'atleast 10 characters'}])

    // Create task role
    // ECS task role
    const ecsTaskRole = new iam.Role(this, `ecs-taskRole-${this.stackName}`, {
      roleName: `ecs-taskRole-${this.stackName}`,
      assumedBy: new iam.ServicePrincipal('ecs-tasks.amazonaws.com')
    });
    ecsTaskRole.addManagedPolicy(ManagedPolicy.fromAwsManagedPolicyName("service-role/AmazonECSTaskExecutionRolePolicy"))
    ecsTaskRole.addManagedPolicy(ManagedPolicy.fromAwsManagedPolicyName("AWSXRayDaemonWriteAccess"));
    NagSuppressions.addResourceSuppressions(ecsTaskRole,[{id: 'AwsSolutions-IAM4', reason: 'atleast 10 characters'}])

    // Grant access to Create Log group and Log Stream
    ecsTaskRole.addToPolicy(
      new iam.PolicyStatement({
        actions: [
          "logs:CreateLogGroup",
          "logs:CreateLogStream",
          "logs:PutLogEvents",
          "logs:DescribeLogStreams"
        ],
        resources: [
          "arn:aws:logs:*:*:*"
        ]
      })
    )
    NagSuppressions.addResourceSuppressions(ecsTaskRole,[{id: 'AwsSolutions-IAM5',reason: 'Suppress all AwsSolutions-IAM5 findings'}],true);

    const executionRolePolicy = new iam.PolicyStatement({
      effect: iam.Effect.ALLOW,
      resources: ['*'],
      actions: [
        "ecr:GetAuthorizationToken",
        "ecr:BatchCheckLayerAvailability",
        "ecr:GetDownloadUrlForLayer",
        "ecr:BatchGetImage",
        "logs:CreateLogStream",
        "logs:PutLogEvents"
      ]
    });
    
    // Create ExternalTaskDefinition
    const taskDefinition = new ecs.ExternalTaskDefinition(this, 'ExternalTaskDefinition', {
      taskRole: ecsTaskRole
    });

    taskDefinition.addToExecutionRolePolicy(executionRolePolicy);
    NagSuppressions.addResourceSuppressions(taskDefinition,[{id: 'AwsSolutions-IAM5',reason: 'Suppress all AwsSolutions-IAM5 findings'}],true);

    const container = taskDefinition.addContainer('EcsAnywhereContainer', {
      image: ecs.ContainerImage.fromRegistry('nginxdemos/hello'),
      memoryLimitMiB: 1024,
      containerName: "EcsAnywhereContainer",
      logging: ecs.LogDriver.awsLogs({ streamPrefix: "ecs-anywhere-logs" }),
    })

    container.addPortMappings({
      containerPort: 80,
      hostPort: 80
    });

    // Create ExternalService
    this.service = new ecs.ExternalService(this, 'ExternalService', {
      serviceName: "EcsAnywhereService",
      cluster: ecsAnywhereCluster,
      taskDefinition,
      desiredCount: 1,
    })

    // Create IAM Role
    const instance_iam_role = new iam.Role(this, 'EcsAnywhereInstanceRole', {
      roleName: "EcsAnywhereInstanceRole",
      assumedBy: new iam.ServicePrincipal('ssm.amazonaws.com'),
      managedPolicies: [
        iam.ManagedPolicy.fromAwsManagedPolicyName("AmazonSSMManagedInstanceCore"),
        iam.ManagedPolicy.fromManagedPolicyArn(this, "EcsAnywhereEC2Policy", "arn:aws:iam::aws:policy/service-role/AmazonEC2ContainerServiceforEC2Role"),
      ]
    })
    instance_iam_role.withoutPolicyUpdates();
    NagSuppressions.addResourceSuppressions(instance_iam_role,[{id: 'AwsSolutions-IAM4', reason: 'at least 10 characters'}])


    // Output
    new CfnOutput(this, "EcsAnywhereCodeCommitRepo", {
      description: "CodeCommit Repo Name",
      value: this.repo.repositoryName,
      exportName: "CodeRepoName"
    })

    new CfnOutput(this, "RegisterExternalInstance", {
      description: "Create an Systems Manager activation pair",
      value: `aws ssm create-activation --iam-role ${instance_iam_role.roleName} | tee ssm-activation.json`,
      exportName: "1-RegisterExternalInstance",
    })

    new CfnOutput(this, "DownloadInstallationScript", {
      description: "On your VM, download installation script",
      value: 'curl --proto "https" -o "/tmp/ecs-anywhere-install.sh" "https://amazon-ecs-agent.s3.amazonaws.com/ecs-anywhere-install-latest.sh" && sudo chmod +x ecs-anywhere-install.sh',
      exportName: "2-DownloadInstallationScript",
    });

    new CfnOutput(this, "ExecuteScript", {
      description: "Run installation script on VM",
      value: "sudo ./ecs-anywhere-install.sh  --region $REGION --cluster $CLUSTER_NAME --activation-id $ACTIVATION_ID --activation-code $ACTIVATION_CODE",
      exportName: "3-ExecuteInstallationScript",
    });

  }
}
