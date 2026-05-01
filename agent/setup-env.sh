#!/bin/bash

# Environment Variable Setup Script
# This script helps you set up environment variables for roo-code-settings.json

set -e

SCRIPT_DIR="$(cd "$(dirname "${BASH_SOURCE[0]}")" && pwd)"
ENV_FILE="$SCRIPT_DIR/.env"
ENV_EXAMPLE="$SCRIPT_DIR/.env.example"

echo "🔧 Environment Variable Setup Script"
echo "===================================="
echo ""

# Check if .env already exists
if [ -f "$ENV_FILE" ]; then
    echo "⚠️  .env file already exists at $ENV_FILE"
    read -p "Do you want to overwrite it? (y/n) " -n 1 -r
    echo
    if [[ ! $REPLY =~ ^[Yy]$ ]]; then
        echo "Skipping .env creation"
        exit 0
    fi
fi

# Copy .env.example to .env
if [ ! -f "$ENV_EXAMPLE" ]; then
    echo "❌ Error: .env.example not found at $ENV_EXAMPLE"
    exit 1
fi

echo "📋 Creating .env from .env.example..."
cp "$ENV_EXAMPLE" "$ENV_FILE"
echo "✅ Created $ENV_FILE"
echo ""

# Check if .env is in .gitignore
if grep -q "^\.env" "$SCRIPT_DIR/../.gitignore" 2>/dev/null; then
    echo "✅ .env is already in .gitignore"
else
    echo "📝 Adding .env to .gitignore..."
    echo ".env" >> "$SCRIPT_DIR/../.gitignore"
    echo ".env.local" >> "$SCRIPT_DIR/../.gitignore"
    echo "✅ Added .env to .gitignore"
fi
echo ""

# Check if dotenv is installed
echo "📦 Checking for dotenv package..."
if npm list dotenv > /dev/null 2>&1; then
    echo "✅ dotenv is installed"
else
    echo "⚠️  dotenv is not installed"
    read -p "Do you want to install it? (y/n) " -n 1 -r
    echo
    if [[ $REPLY =~ ^[Yy]$ ]]; then
        echo "📥 Installing dotenv..."
        npm install dotenv
        echo "✅ dotenv installed"
    fi
fi
echo ""

# Open .env in editor
echo "📝 Next steps:"
echo "1. Edit $ENV_FILE with your actual credentials"
echo "2. Run: node validate-env-vars.js"
echo "3. Verify all variables are resolved"
echo ""

read -p "Do you want to open .env in your editor now? (y/n) " -n 1 -r
echo
if [[ $REPLY =~ ^[Yy]$ ]]; then
    if [ -n "$EDITOR" ]; then
        $EDITOR "$ENV_FILE"
    elif command -v nano &> /dev/null; then
        nano "$ENV_FILE"
    elif command -v vi &> /dev/null; then
        vi "$ENV_FILE"
    else
        echo "❌ No editor found. Please edit $ENV_FILE manually"
    fi
fi

echo ""
echo "✅ Setup complete!"
echo ""
echo "To validate your setup, run:"
echo "  node validate-env-vars.js"
echo ""
