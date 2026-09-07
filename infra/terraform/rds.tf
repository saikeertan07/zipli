# PostgreSQL Relational Database (RDS)
resource "aws_db_subnet_group" "rds" {
  name       = "zipli-rds-subnet-group"
  subnet_ids = aws_subnet.private[*].id

  tags = {
    Name = "zipli-rds-subnets"
  }
}

resource "aws_security_group" "rds" {
  name        = "zipli-rds-sg"
  description = "Allows PostgreSQL traffic from ECS tasks only"
  vpc_id      = aws_vpc.main.id

  ingress {
    protocol        = "tcp"
    from_port       = 5432
    to_port         = 5432
    security_groups = [aws_security_group.ecs_tasks.id]
  }

  egress {
    protocol    = "-1"
    from_port   = 0
    to_port     = 0
    cidr_blocks = ["0.0.0.0/0"]
  }
}

resource "aws_db_instance" "postgres" {
  identifier             = "zipli-${var.environment}-postgres"
  engine                 = "postgres"
  engine_version         = "15"
  instance_class         = var.db_instance_class
  allocated_storage      = 50
  max_allocated_storage  = 200
  storage_type           = "gp3"
  db_name                = var.db_name
  username               = var.db_username
  manage_master_user_password = true

  db_subnet_group_name   = aws_db_subnet_group.rds.name
  vpc_security_group_ids = [aws_security_group.rds.id]

  skip_final_snapshot    = true
  deletion_protection    = false
  backup_retention_period = 7
}
