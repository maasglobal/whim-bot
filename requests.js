'use strict';
/**
 * This file is an abstraction of the RESTful services used by whim-bot
 * LICENSE: MIT
 */
const request = require('request-promise');

const WHIM_API_URL = process.env.WHIM_API_URL;
const WHIM_API_KEY = process.env.WHIM_API_KEY;
const GOOGLE_API_URL = 'https://maps.googleapis.com/maps/api/place/textsearch/json';
const GOOGLE_REVERSE_GEOCODE_URL = 'https://maps.googleapis.com/maps/api/geocode/json';
const GOOGLE_PLACE_URL = 'https://maps.googleapis.com/maps/api/place/details/json';
const GOOGLE_API_KEY = process.env.GOOGLE_API_KEY;
const YELP_API_URL = 'https://api.yelp.com/v3/businesses/search';
const YELP_APP_ID = process.env.YELP_APP_ID;
const YELP_APP_SECRET = process.env.YELP_APP_SECRET;
const YELP_ACCESS_TOKEN = process.env.YELP_ACCESS_TOKEN;
const WHIM_DEFAULT_HEADERS = {
  'X-API-Key': WHIM_API_KEY,
  'Accept': 'application/json;version=3.0.0'
}

module.exports.unlink = function (psid) {
  return request.post(`https://graph.facebook.com/v2.6/me/unlink_accounts?access_token=${process.env.FB_PAGE_TOKEN}`, {
    method: 'POST',
    form: {
      psid: psid
    },
    json: true
  });
};

module.exports.requestCode = function (phone) {
  return request.get(WHIM_API_URL + '/auth/sms-request-code', {
    qs: {
      phone: phone
    },
    headers: WHIM_DEFAULT_HEADERS,
    json: true
  });
};

module.exports.login = function (phone, code) {
  return request.get(WHIM_API_URL + '/auth/sms-login', {
    qs: {
      phone: phone,
      code: code
    },
    headers: WHIM_DEFAULT_HEADERS,
    json: true
  });
};

module.exports.routes = function (from, to, token) {
  console.log('names', from.name, to.name);
  console.log(`streetName:${from.addressComponents.streetName}|streetNumber:${from.addressComponents.streetNumber}|city:${from.addressComponents.city}|country:${from.addressComponents.country}`)
  console.log(`streetName:${to.addressComponents.streetName}|streetNumber:${to.addressComponents.streetNumber}|city:${to.addressComponents.city}|country:${to.addressComponents.country}`)
  return request.get(WHIM_API_URL + '/routes', {
    qs: {
      from: from.latitude + ',' + from.longitude,
      to: to.latitude + ',' + to.longitude,
      toAddress: `streetName:${to.addressComponents.streetName}|streetNumber:${to.addressComponents.streetNumber}|city:${to.addressComponents.city}|country:${to.addressComponents.country}`,
      fromAddress: `streetName:${from.addressComponents.streetName}|streetNumber:${from.addressComponents.streetNumber}|city:${from.addressComponents.city}|country:${from.addressComponents.country}`,
      toName: to.name,
      fromName: from.name
    },
    headers: {
      'X-API-Key': WHIM_API_KEY,
      'Authorization': 'Bearer ' + token,
      'Accept': 'application/json;version=3.0.0'
    },
    json: true,
    verbose: true
  })
  .catch( err => {
    console.log('ERROR fetching routes', err);
    return {};
  });
};

module.exports.favorites = (token) => {
  return request.get( WHIM_API_URL + '/profile', {
    headers: {
      'X-API-Key': WHIM_API_KEY,
      'Authorization': 'Bearer ' + token,
      'Accept': 'application/json;version=3.0.0'
    },
    json: true,
    verbose: true
  });
};

module.exports.reverse = (lat, lng, token, name) => {
    console.log('reverse geocoding', `${lat}, ${lng}`)
    return request.get(`${GOOGLE_REVERSE_GEOCODE_URL}`, {
      qs: {
        latlng: `${lat}, ${lng}`,
        key: GOOGLE_API_KEY
      },
      headers: {
        'Accept-Language': 'fi'
      },
      json: true,
      verbose: true
    })
    .then( place => {
      if (!place.results) {
        return {};
      }
      for (const result of place.results) {
        const addressComponents = {};
        if (!result.types.find( type => type === 'street_address')) {
          continue;
        }
        const streetName = result.address_components.filter( comp => { return comp.types.find( type => type === 'route' ) } );
        const streetNumber = result.address_components.filter( comp => { return comp.types.find(type => type === 'street_number') } );
        const city = result.address_components.filter( comp => { return comp.types.find(type => { return (type === 'locality' || type === 'administrative_area_level_3'); } ) } );
        const country = result.address_components.filter( comp => { return comp.types.find(type => type === 'country') } );
        
        if (streetName && streetName.length) {
          addressComponents.streetName = streetName[0].long_name;
        }
        if (streetNumber && streetNumber.length) {
          addressComponents.streetNumber = parseInt(streetNumber[0].long_name);
        } else {
          addressComponents.streetNumber = 1;
        }
        if (city && city.length) {
          addressComponents.city = city[0].long_name;
        }
        if (country) {
          addressComponents.country = country[0].long_name;
        }
        console.log('Components', addressComponents);
        return {
          latitude: result.geometry.location.lat,
          longitude: result.geometry.location.lng,
          name: name ? name : result.formatted_address,
          addressComponents
        }
      }
    });
};
/*
module.exports.geocode = (text, lat, lon, token) => {
  return request.get(`${WHIM_API_URL}/geocoding`, {
    qs: {
      name: text,
      lat: lat,
      lon: lon,
    },
    headers: {
      'X-API-Key': WHIM_API_KEY,
      'Authorization': 'Bearer ' + token,
      'Accept': 'application/json;version=3.0.0'
    },
    json: true
  });
};*/
module.exports.geocode = (text, lat, lon, token) => {
  return request.get(`${GOOGLE_API_URL}`, {
    qs: {
      query: text,
      key: GOOGLE_API_KEY
    },
    json: true
  })
  .then( response => {
    for (const item of response.results) {
      if (item.hasOwnProperty('place_id')) {
        return module.exports.reverse(item.geometry.location.lat, item.geometry.location.lng, null, item.name)
      }
    }
    console.log('Could not find a place since were here');
    return {};
  })
  .catch( err => {
    console.error('ERROR', err);
    return {};
  });
};

module.exports.book = (itinerary, token) => {
  return request.post(WHIM_API_URL + '/itineraries', {
    headers: {
      'X-API-Key': WHIM_API_KEY,
      'Authorization': 'Bearer ' + token,
      'Accept': 'application/json;version=3.0.0'
    },
    json: true,
    method: 'POST',
    body: {
      itinerary: itinerary
    }
  });
};
module.exports.locations = (str) => {
  return request.get(YELP_API_URL, {
    qs: {
      location: str,
    },
    headers: {
      'Authorization': 'Bearer ' + YELP_ACCESS_TOKEN
    },
    json: true
  });
};

module.exports.places = (str, lat, lon) => {
  return request.get(YELP_API_URL,{
    qs: {
      latitude: lat,
      longitude: lon,
      term: str,
      limit: 25,
      //open_now: true,
      sort_by: 'distance',
      price: '1,2,3'
    },
    headers: {
      'Authorization': 'Bearer ' + YELP_ACCESS_TOKEN
    },
    json: true
  });
};

module.exports.localTime = (lat, lon, utcTime) => {
  const url = `https://maps.googleapis.com/maps/api/timezone/json`;
  return request.get(url, {
    qs: {
      lat: lat,
      lon: lon,
      timestamp: utcTime,
    },
    json: true
  });
}

module.exports.whimCarAvailability = (lat, lon, utcTime) => {
  const url = `https://maps.googleapis.com/maps/api/timezone/json`;
  return request.get(url, {
    qs: {
      lat: lat,
      lon: lon,
      timestamp: utcTime,
    },
    json: true
  });
}