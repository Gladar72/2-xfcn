# Модерация фото на своём сервере (NudeNet, CPU). См. server.py.
FROM python:3.11-slim
WORKDIR /srv
RUN pip install --no-cache-dir nudenet==3.4.2 pillow==10.4.0
COPY server.py .
# Прогрев: модель грузится при сборке, чтобы первый запрос не ждал.
RUN python -c "from nudenet import NudeDetector; NudeDetector()"
EXPOSE 8000
CMD ["python", "server.py"]
