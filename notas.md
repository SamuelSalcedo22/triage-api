# Docker

docker compose up -d      # Levanta Postgres y pgAdmin en segundo plano
docker compose ps         # Ver los contenedores
docker compose logs -f postgres
docker compose down       # Detener
docker compose down -v    # Detener y BORRAR la base de datos (empezar de cero)
