provider "aws" {
  region = "us-east-1"
}

resource "aws_s3_bucket" "example" {
  bucket = "my-example-bucket-1802000000"
  tags = {
    Name = "ExampleBucket"
  }
}
terraform {
  backend "s3" {
    bucket         = "my-terraform-stat-12345bucketet"   # your S3 bucket
    key            = "env/dev/terraform.tfstate"   # path inside S3
    region         = "us-east-1"
    #dynamodb_table = "terraform-locks"             # optional
    #encrypt        = true
  }
}

