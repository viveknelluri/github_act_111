provider "aws" {
  region = "us-east-1"
}

resource "aws_s3_bucket" "example" {
  bucket = "my-example-bucket-1802000000"
  tags = {
    Name = "ExampleBucket"
  }
}
