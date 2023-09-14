Vagrant.configure("2") do |config|
  config.vm.box = "bento/ubuntu-20.04-arm64"
  config.vm.network "forwarded_port", guest: 80, host: 80
  config.vm.provider "vmware_desktop" do |vb|
    vb.memory = 2048
    vb.cpus = 2
    vb.gui = true
  end
end
