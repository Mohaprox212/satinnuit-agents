'use strict';

const https = require('https');

const STORE = process.env.SHOPIFY_STORE || 'ggz3rz-cx.myshopify.com';
const TOKEN = process.env.SHOPIFY_TOKEN || '';

/**
 * Exécute une requête GraphQL Shopify Admin.
 */
function gql(query, variables = {}) {
  return new Promise((resolve, reject) => {
    const body = JSON.stringify({ query, variables });
    const req  = https.request({
      hostname: STORE,
      path    : '/admin/api/2024-10/graphql.json',
      method  : 'POST',
      headers : {
        'Content-Type'             : 'application/json',
        'X-Shopify-Access-Token'   : TOKEN,
        'Content-Length'           : Buffer.byteLength(body),
      },
    }, res => {
      let d = '';
      res.on('data', c => d += c);
      res.on('end', () => {
        try { resolve(JSON.parse(d)); }
        catch(e) { reject(new Error('JSON parse: ' + d.slice(0, 200))); }
      });
    });
    req.on('error', reject);
    req.write(body);
    req.end();
  });
}

/**
 * Retourne les commandes des dernières N heures.
 */
async function getRecentOrders(hoursBack = 24) {
  const since = new Date(Date.now() - hoursBack * 3600_000).toISOString();

  const result = await gql(`
    query($query: String!) {
      orders(first: 250, query: $query, sortKey: CREATED_AT, reverse: true) {
        nodes {
          id
          name
          createdAt
          totalPriceSet { shopMoney { amount currencyCode } }
          lineItems(first: 10) {
            nodes { title quantity variantTitle }
          }
          customer { firstName lastName email }
          financialStatus
          fulfillmentStatus
        }
      }
    }
  `, { query: `created_at:>='${since}'` });

  return result?.data?.orders?.nodes || [];
}

/**
 * Retourne les statistiques globales du shop.
 */
async function getShopInfo() {
  const result = await gql(`
    query {
      shop {
        name
        myshopifyDomain
        primaryDomain { url }
        currencyCode
      }
    }
  `);
  return result?.data?.shop || {};
}

/**
 * Retourne les variantes du produit principal (stock, prix).
 */
async function getProductVariants(productGid) {
  const result = await gql(`
    query($id: ID!) {
      product(id: $id) {
        title
        variants(first: 20) {
          nodes {
            id
            title
            price
            inventoryQuantity
          }
        }
      }
    }
  `, { id: productGid });
  return result?.data?.product || {};
}

module.exports = { gql, getRecentOrders, getShopInfo, getProductVariants };
