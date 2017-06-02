'use strict';
/**
 * Utility functions that are pretty much self contained
 * @author Sami Pippuri <sami.pippuri@maas.global>
 */

const _ = require('lodash');

/**
 * filter Taxi routes
 * @param {Array} itineraries 
 */
const filterTaxi = (itineraries) => {
  let ret = undefined;
  for (const item of itineraries) {
    //console.log('Looking for TAXI itinerary', item.legs[0]);
    if (item.legs[0].mode === 'TAXI') {
      console.log('Found a TAXI itinerary', item);
      ret = item;
    }
  }
  return ret;  
}

const filterPT = (itineraries) => {
  let ret = undefined;
  console.log('TODO: filterPT for the best match/score!!');
  for (const item of itineraries) {
    if (!ret && item.fare.amount !== null) {
      ret = item;
    }
  }
  return ret;
}


const filterGeoCollection = coll => {
  if (!coll || !coll.features || coll.features.length < 1) {
    console.log('This wasnt a feature collection');
    return null;
  }
  for (const feature of coll.features) {
    if (feature.type === 'Feature' && 
        feature.properties && 
        feature.properties.name && 
        feature.geometry) {
          console.log('Found a match', JSON.stringify(feature));
      let name = `${feature.properties.name}`;
      if (feature.properties.zipCode && feature.properties.city) {
        name += `(${feature.properties.zipCode} ${feature.properties.city})`;
      }
      return {
        latitude: feature.geometry.coordinates[0],
        longitude: feature.geometry.coordinates[1],
        name: name
      }
    } else {
       console.log('failed', feature.type, feature.properties, feature.properties.name, feature.geometry);
    }
  }
  return null;
}

const filterGeoCollectionGoogle = coll => {
  
  return coll;
}

const msToTime = duration => {
    var seconds = parseInt((duration/1000)%60)
        , minutes = parseInt((duration/(1000*60))%60)
        , hours = parseInt((duration/(1000*60*60))%24);

    //hours = (hours < 10) ? "0" + hours : hours;
    //minutes = (minutes < 10) ? "0" + minutes : minutes;
    if (hours > 0) {
      return `${hours}h ${minutes}min`;
    } else {
      return `${minutes}min`;
    }
}

const parseLeaveTime = startTime => {
    var seconds = parseInt((startTime/1000)%60)
        , minutes = parseInt((startTime/(1000*60))%60)
        , hours = parseInt((startTime/(1000*60*60))%24);

    //hours = (hours < 10) ? "0" + hours : hours;
    //minutes = (minutes < 10) ? "0" + minutes : minutes;
    if (hours > 0) {
      return `${hours}h ${minutes}min`;
    } else {
      return `${minutes}min`;
    }
}

const calcDuration = itinerary => {
  if (!itinerary || !itinerary.startTime) return -1;
  const diff = itinerary.endTime - itinerary.startTime;
  return msToTime(diff); 
}

const kFormatter = num => {
    return num > 999 ? (num/1000).toFixed(1) + 'km' : Math.floor(num) + 'm'
}

const randomInRange = (minimum, maximum) => {
  return Math.floor(Math.random() * (maximum - minimum + 1)) + minimum;
}

const nearestBusiness = items => {
  if (!items || items.length === 0) return null;
  const nearest = _.minBy(items, item => item.distance );
  let distanceScore = nearest.distance / 100;
  if (distanceScore < 1.0) {
    distanceScore = 1;
  }
  items.map( item => {
    let rating = item.rating ? item.rating : 3.0;
    if (rating > 3.0 && item.review_count < 10) rating = 3.0;
    item.score = ((rating * 1000) - ((item.distance - nearest.distance) / distanceScore));
    //console.log(`${item.name} rating ${rating} distance ${item.distance} score ${item.score}`)
  });
  const max = _.maxBy(items, item => item.score);

  return max;
}

const randomBusiness = (items, nearest) => {
  // first, order them based on scores calculated above
  const sorted = _.reverse(_.sortBy(items, item => item.score));
  const rand = randomInRange(0, items.length - 1);
  const choice = items[Math.floor(rand / 4)]; // top quarter of the sorted array
  //console.log('Random business selected is', choice);
  if (nearest.id === choice.id && items.count > 2) {
    return randomBusiness(items, nearest);
  }
  return choice;
}

module.exports = {
  calcDuration,
  parseLeaveTime,
  filterGeoCollection,
  filterGeoCollectionGoogle,
  filterPT,
  filterTaxi,
  kFormatter,
  randomInRange,
  nearestBusiness,
  randomBusiness,
};