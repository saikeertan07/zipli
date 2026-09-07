variable "aws_region" {
  description = "AWS deployment region"
  type        = string
  default     = "ap-south-1" # Mumbai for ultra-low latency Indian quick-commerce
}

variable "environment" {
  description = "Deployment environment name"
  type        = string
  default     = "production"
}

variable "vpc_cidr" {
  description = "CIDR block for the Zipli VPC"
  type        = string
  default     = "10.0.0.0/16"
}

variable "app_image" {
  description = "Container image URI for Zipli Pro API"
  type        = string
  default     = "zipli/api:latest"
}

variable "app_count" {
  description = "Number of ECS Fargate tasks to run"
  type        = number
  default     = 2
}

variable "db_name" {
  description = "PostgreSQL database name"
  type        = string
  default     = "zipli_prod"
}

variable "db_username" {
  description = "PostgreSQL master username"
  type        = string
  default     = "zipli_admin"
}

variable "db_instance_class" {
  description = "RDS instance class"
  type        = string
  default     = "db.t4g.medium"
}
