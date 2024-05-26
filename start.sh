#!/bin/bash

# Set the environment to production
#export NODE_ENV=production

# Install dependencies
npm install

# Build the application
npm run build

# Start the application in production mode
npm run start:prod