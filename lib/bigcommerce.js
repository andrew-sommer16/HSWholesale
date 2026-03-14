import axios from 'axios';

// Standard BigCommerce REST API (orders, customers etc)
export const bcAPI = (storeHash, accessToken) => {
  return axios.create({
    baseURL: `https://api.bigcommerce.com/stores/${storeHash}`,
    headers: {
      'X-Auth-Token': accessToken,
      'Content-Type': 'application/json',
      'Accept': 'application/json',
    },
  });
};

// B2B Edition API — requires both X-Auth-Token and X-Store-Hash headers
export const b2bAPI = (storeHash, accessToken) => {
  return axios.create({
    baseURL: `https://api-b2b.bigcommerce.com/api/v3/io`,
    headers: {
      'X-Auth-Token': accessToken,
      'X-Store-Hash': storeHash,
      'Content-Type': 'application/json',
      'Accept': 'application/json',
    },
  });
};

export const getStoreCredentials = async (supabase, storeHash) => {
  const { data, error } = await supabase
    .from('bc_stores')
    .select('access_token')
    .eq('store_hash', storeHash)
    .single();

  if (error || !data) throw new Error('Store not found');
  return data.access_token;
};