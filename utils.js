'use strict';

module.exports.filterTaxi = (itineraries) => {
  let ret = undefined;
  for (const item of itineraries) {
    //console.log('Looking for TAXI itinerary', item);
    if (item.legs[0].mode === 'TAXI') {
      console.log('Found a TAXI itinerary', item);
      ret = item;
    }
  }
  return ret;  
}

module.exports.filterPT = (itineraries) => {
  let ret = undefined;
  console.log('TODO: filterPT for the best match/score!!');
  for (const item of itineraries) {
    if (!ret && item.fare.points !== null) {
      ret = item;
    }
  }
  return ret;
}


module.exports.filterGeoCollection = coll => {
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

module.exports.parseLeaveTime = startTime => {
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

module.exports.calcDuration = itinerary => {
  if (!itinerary || !itinerary.startTime) return -1;
  const diff = itinerary.endTime - itinerary.startTime;
  return msToTime(diff); 
}

module.exports.concatenateQueryString = params => {
  const ret = [];
  Object.keys(params).map( key => {
    const val = params[key];
    ret.push( `${key}=${encodeURIComponent(val)}` );
  });

  return ret.join('&');
}
