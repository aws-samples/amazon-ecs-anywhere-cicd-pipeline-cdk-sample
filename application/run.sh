docker build -t nginx-app .
docker tag nginx-app:latest $1
docker push $1
