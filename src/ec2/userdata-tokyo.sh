sudo yum update -y
sudo yum install -y httpd
sudo systemctl start httpd
sudo systemctl enable httpd
sudo touch /var/www/html/index.html
echo "Hello from tokyo!" | sudo tee -a /var/www/html/index.html
