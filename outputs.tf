output "server_ip_public" {
  value = module.my_server_public.public_ip
}

output "ssm_command_public" {
  value = "aws ssm start-session --target ${module.my_server_public.id}"
}

output "server_ip_private" {
  value = module.my_server_private.public_ip
}

output "ssm_command_private" {
  value = "aws ssm start-session --target ${module.my_server_private.id}"
}

output "server_ip_private2" {
  value = module.my_server_private.public_ip
}

output "ssm_command_private2" {
  value = "aws ssm start-session --target ${module.my_server_private.id}"
}
