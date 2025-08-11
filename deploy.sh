
#!/bin/bash
set -e

echo "Starting Suna deployment setup..."

# Install backend dependencies
echo "Installing backend dependencies..."
cd backend
pip install -r requirements.txt 2>/dev/null || pip install fastapi uvicorn python-multipart aiofiles
cd ..

# Install frontend dependencies and build
echo "Installing frontend dependencies..."
cd frontend
npm install
echo "Building frontend..."
npm run build
cd ..

echo "Setup complete! Starting application..."
cd backend
python -m uvicorn api:app --host 0.0.0.0 --port 5000
