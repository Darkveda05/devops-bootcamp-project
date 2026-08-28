resource "local_file" "inventory" {
  filename = "inventory.ini"
  content = templatefile("inventory.ini.tftpl", {
    node1_ip = module.node1.private_ip
    node2_ip = module.node2.private_ip
	node3_ip = module.node3.private_ip
  })
}
