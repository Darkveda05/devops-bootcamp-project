
output "node1_private_ip" { value = module.node1.private_ip }
output "node2_private_ip" { value = module.node2.private_ip }
output "node3_private_ip" { value = module.node3.private_ip }
output "node3_public_ip" { value = module.node3.public_ip }


output "ssm_node1" { value = "aws ssm start-session --target ${module.node1.id}" }
output "ssm_node2" { value = "aws ssm start-session --target ${module.node2.id}" }
output "ssm_node3" { value = "aws ssm start-session --target ${module.node3.id}" }





