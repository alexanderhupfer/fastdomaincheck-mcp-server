import whois from 'whois';
import dns from 'node:dns/promises';
import punycode from 'punycode';
import { tldWhoisServers, unregisteredPatterns } from './config.js';

const WHOIS_TIMEOUT = 10000; // 10 seconds
const MAX_DOMAIN_LENGTH = 253;
const MIN_DOMAIN_LENGTH = 1;
const VERSION = '1.0.2'; // Force refresh again

function validateDomain(domain) {
  if (!domain || typeof domain !== 'string') {
    throw new Error('Domain must be a non-empty string');
  }

  const trimmedDomain = domain.trim().toLowerCase();
  
  if (trimmedDomain.length < MIN_DOMAIN_LENGTH || trimmedDomain.length > MAX_DOMAIN_LENGTH) {
    throw new Error(`Domain length must be between ${MIN_DOMAIN_LENGTH} and ${MAX_DOMAIN_LENGTH} characters`);
  }

  // Basic domain format validation
  const domainRegex = /^[a-z0-9]([a-z0-9-]{0,61}[a-z0-9])?(\.[a-z0-9]([a-z0-9-]{0,61}[a-z0-9])?)*$/i;
  if (!domainRegex.test(trimmedDomain) && !isValidIDN(trimmedDomain)) {
    throw new Error('Invalid domain format');
  }

  return trimmedDomain;
}

function isValidIDN(domain) {
  try {
    const ascii = punycode.toASCII(domain);
    return ascii !== domain; // It's an IDN if conversion changed it
  } catch {
    return false;
  }
}

function getTLD(domain) {
  const parts = domain.split('.');
  if (parts.length < 2) {
    return null;
  }
  return parts[parts.length - 1];
}

function getWhoisServer(tld) {
  // Convert IDN TLD to ASCII for lookup
  const asciiTld = punycode.toASCII(tld);
  return tldWhoisServers[asciiTld] || tldWhoisServers[tld] || null;
}

function isUnregistered(whoisData, tld) {
  if (!whoisData) return true;
  
  const dataLower = whoisData.toLowerCase();
  
  // First check for strong registration indicators
  const registeredIndicators = [
    /^\s*domain name:\s*\S+/im,
    /^\s*registry domain id:\s*\S+/im,
    /^\s*registrar whois server:/im,
    /^\s*registrar url:/im,
    /^\s*creation date:/im,
    /^\s*created:/im,
    /^\s*registered on:/im,
    /^\s*expiry date:/im,
    /^\s*expiration date:/im,
    /^\s*registry expiry date:/im,
    /^\s*registrar:\s*\S+/im,
    /^\s*registrant/im,
    /^\s*updated date:/im,
    /^\s*last updated:/im,
    /^\s*status:\s*(active|ok|registered|clienttransferprohibited)/im,
    /^\s*domain status:\s*(active|ok|registered|clienttransferprohibited)/im,
    /^\s*name server:/im,
    /^\s*nameserver:/im,
    /^\s*dns:/im,
    /^\s*dnssec:/im,
    /^\s*registrar iana id:/im,
    /^\s*registrar abuse contact/im,
  ];
  
  // If we find ANY strong registration indicator, it's registered
  for (const indicator of registeredIndicators) {
    if (indicator.test(whoisData)) {
      return false;
    }
  }
  
  // Now check for unregistered patterns - be more specific
  const unregisteredPatternsSpecific = [
    // Very specific "not found" patterns
    /^no match for domain/im,
    /^no match for ".*"/im,
    /^not found\.?\s*$/im,
    /^domain not found/im,
    /^no data found/im,
    /^no entries found/im,
    /^object does not exist/im,
    /^%% no entries found/im,
    /^not registered/im,
    /^available for registration/im,
    /^this domain is available/im,
    /^status:\s*available/im,
    /^domain status:\s*available/im,
    // Length check - if the entire response is just "not found" or similar
    /^[\s\n]*(not found|no match|available|free)[\s\n]*$/i,
  ];
  
  // Also check TLD-specific patterns
  const tldPatterns = unregisteredPatterns[tld] || [];
  const allUnregisteredPatterns = [...unregisteredPatternsSpecific, ...tldPatterns];
  
  for (const pattern of allUnregisteredPatterns) {
    if (pattern.test(whoisData)) {
      // Double-check it's not a false positive by ensuring no registration data
      const hasRegistrationData = dataLower.includes('registrar:') || 
                                 dataLower.includes('creation date:') ||
                                 dataLower.includes('domain name:') ||
                                 dataLower.includes('registry domain id:');
      
      if (!hasRegistrationData) {
        return true;
      }
    }
  }
  
  // For very short responses, check if they're just errors
  if (whoisData.trim().length < 100) {
    const errorPatterns = [
      /error/i,
      /quota exceeded/i,
      /limit exceeded/i,
      /try again/i,
      /temporarily unavailable/i,
      /connection refused/i,
      /timeout/i,
      /rate limit/i,
    ];
    
    for (const pattern of errorPatterns) {
      if (pattern.test(whoisData)) {
        // Error response - assume registered to be safe
        return false;
      }
    }
  }
  
  // Default to registered if unclear - prevents false positives
  return false;
}

async function queryWhois(domain, server) {
  return new Promise((resolve, reject) => {
    const timeout = setTimeout(() => {
      reject(new Error('WHOIS query timeout'));
    }, WHOIS_TIMEOUT);

    // Use higher follow count to ensure we get to the actual registrar
    whois.lookup(domain, { server, follow: 5 }, (err, data) => {
      clearTimeout(timeout);
      if (err) {
        reject(err);
      } else {
        resolve(data);
      }
    });
  });
}

async function checkDNS(domain) {
  try {
    // Try to resolve A records
    await dns.resolve4(domain);
    return true;
  } catch (error) {
    if (error.code === 'ENOTFOUND' || error.code === 'ENODATA') {
      // Try to resolve AAAA records
      try {
        await dns.resolve6(domain);
        return true;
      } catch {
        // Try to resolve NS records
        try {
          await dns.resolveNs(domain);
          return true;
        } catch {
          return false;
        }
      }
    }
    return false;
  }
}

async function checkSingleDomain(domain) {
  try {
    const validatedDomain = validateDomain(domain);
    const asciiDomain = punycode.toASCII(validatedDomain);
    const tld = getTLD(validatedDomain);
    
    if (!tld) {
      return {
        domain: domain,
        available: false,
        error: 'Invalid domain format'
      };
    }

    const whoisServer = getWhoisServer(tld);
    
    if (!whoisServer) {
      // No WHOIS server, fall back to DNS check
      const hasRecords = await checkDNS(asciiDomain);
      return {
        domain: domain,
        available: !hasRecords,
        method: 'dns'
      };
    }

    try {
      const whoisData = await queryWhois(asciiDomain, whoisServer);
      const available = isUnregistered(whoisData, tld);
      
      // Debug logging for development
      if (process.env.DEBUG_WHOIS) {
        console.error(`\n=== WHOIS Debug for ${domain} ===`);
        console.error(`TLD: ${tld}, Server: ${whoisServer}`);
        console.error(`Response length: ${whoisData.length}`);
        console.error(`First 500 chars:\n${whoisData.substring(0, 500)}`);
        console.error(`Available: ${available}`);
        console.error(`=== End Debug ===\n`);
      }
      
      return {
        domain: domain,
        available: available,
        method: 'whois'
      };
    } catch (whoisError) {
      // Fall back to DNS check
      const hasRecords = await checkDNS(asciiDomain);
      return {
        domain: domain,
        available: !hasRecords,
        method: 'dns',
        fallback: true
      };
    }
  } catch (error) {
    return {
      domain: domain,
      available: false,
      error: error.message
    };
  }
}

export async function checkDomains(domains) {
  const results = [];
  
  for (const domain of domains) {
    const result = await checkSingleDomain(domain);
    results.push(result);
    
    // Small delay to avoid rate limiting
    await new Promise(resolve => setTimeout(resolve, 300));
  }
  
  return results;
}