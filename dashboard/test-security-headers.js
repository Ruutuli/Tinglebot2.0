#!/usr/bin/env node

/**
 * Security Headers Test Script
 * 
 * This script tests the security headers implementation by making a request
 * to the local server and checking for the presence of security headers.
 * 
 * Usage: node test-security-headers.js
 */

const http = require('http');

const options = {
  hostname: 'localhost',
  port: 5001,
  path: '/',
  method: 'GET',
  headers: {
    'User-Agent': 'Security-Test-Script/1.0'
  }
};

console.log('🔒 Testing Security Headers...\n');

const req = http.request(options, (res) => {
  console.log(`Status: ${res.statusCode}`);
  console.log(`Headers:`);
  
  const securityHeaders = [
    'strict-transport-security',
    'x-frame-options',
    'x-content-type-options',
    'referrer-policy',
    'permissions-policy',
    'content-security-policy'
  ];
  
  let allHeadersPresent = true;
  
  securityHeaders.forEach(header => {
    const value = res.headers[header];
    if (value) {
      console.log(`✅ ${header}: ${value}`);
    } else {
      console.log(`❌ ${header}: MISSING`);
      allHeadersPresent = false;
    }
  });
  
  console.log('\n' + '='.repeat(50));
  
  if (allHeadersPresent) {
    console.log('🎉 All security headers are present!');
  } else {
    console.log('⚠️  Some security headers are missing.');
  }
  
  console.log('\n📋 Header Details:');
  Object.keys(res.headers).forEach(key => {
    if (key.toLowerCase().includes('security') || 
        key.toLowerCase().includes('frame') || 
        key.toLowerCase().includes('content') || 
        key.toLowerCase().includes('referrer') || 
        key.toLowerCase().includes('permissions')) {
      console.log(`${key}: ${res.headers[key]}`);
    }
  });
});

req.on('error', (err) => {
  console.error('❌ Error testing headers:', err.message);
  console.log('\n💡 Make sure the server is running with: npm start');
});

req.end();
