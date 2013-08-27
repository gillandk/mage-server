var xmldom = require('xmldom')
  , xpath = require('xpath');

var DOMParser = xmldom.DOMParser
  , XMLSerializer = xmldom.XMLSerializer;

var removeSpace = (/\s*/g),
    trimSpace = (/^\s*|\s*$/g),
    splitSpace = (/\s+/);

// all Y children of X
function get(x, y) { return x.getElementsByTagName(y); }
function attr(x, y) { return x.getAttribute(y); }
function attrf(x, y) { return parseFloat(attr(x, y)); }
// one Y child of X, if any, otherwise null
function get1(x, y) { var n = get(x, y); return n.length ? n[0] : null; }
// https://developer.mozilla.org/en-US/docs/Web/API/Node.normalize
function norm(el) { if (el.normalize) { el.normalize(); } return el; }
// cast array x into numbers
function coordinateArray(x) {
    for (var j = 0, o = []; j < x.length; j++) o[j] = parseFloat(x[j]);
    return o.splice(0,2);
}
function clean(x) {
    var o = {};
    for (var i in x) if (x[i]) o[i] = x[i];
    return o;
}
// get the content of a text node, if any
function nodeVal(x) { if (x) {norm(x);} return x && x.firstChild && x.firstChild.nodeValue; }
// get one coordinate from a coordinate array, if any
function coord1(v) { return coordinateArray(v.replace(removeSpace, '').split(',')); }
// get all coordinates from a coordinate array as [[],[]]
function coord(v) {
    var coords = v.replace(trimSpace, '').split(splitSpace),
        o = [];
    for (var i = 0; i < coords.length; i++) {
        o.push(coord1(coords[i]));
    }
    return o;
}

// create a new feature collection parent object
function fc() {
  return {
    type: 'FeatureCollection',
    features: []
  };
}

var serializer = new XMLSerializer();
function xml2str(node) { return serializer.serializeToString(node); }

var kml = function(data, o) {
    o = o || {};

    var doc = new DOMParser().parseFromString(data);

    var featureCollections = [],
        // styleindex keeps track of hashed styles in order to match features
        styleIndex = {},
        // atomic geospatial types supported by KML - MultiGeometry is
        // handled separately
        geotypes = ['Polygon', 'LineString', 'Point', 'Track'],
        styles = get(doc, 'Style');

    for (var k = 0; k < styles.length; k++) {
      var kmlStyle = styles[k];
      var styleId = '#' + attr(kmlStyle, 'id');

      var style = {};
      var iconStyle = get(kmlStyle, 'IconStyle');
      if (iconStyle[0]) {
        var scale = get(iconStyle[0], 'scale');
        var icon = get(iconStyle[0], 'Icon');

        style.iconStyle = {};
        if (scale) style.iconStyle.scale = nodeVal(scale[0]);
        if (icon) {
          style.iconStyle.icon = {};
          var href = get(icon[0], 'href');
          if (href) style.iconStyle.icon.href = nodeVal(href[0]);
        }

      }

      var lineStyle = get(kmlStyle, 'LineStyle');
      if (lineStyle[0]) {
        style.lineStyle = {};
        var color = get(lineStyle[0], 'color');
        if (color) {
          style.lineStyle.color = nodeVal(color[0]);
        }

        var width = get(lineStyle[0], 'width');
        if (width) {
          style.lineStyle.width = nodeVal(width[0]);
        }
      }

      var labelStyle = get(kmlStyle, 'LabelStyle');
      if (labelStyle[0]) {
        style.labelStyle = {};
        var color = get(labelStyle[0], 'color');
        if (color) {
          style.labelStyle.color = nodeVal(color[0]);
        }

        var scale = get(labelStyle[0], 'scale');
        if (scale) {
          style.labelStyle.color = nodeVal(scale[0]);
        }
      }

      var polyStyle = get(kmlStyle, 'PolyStyle');
      if (polyStyle[0]) {
        style.polyStyle = {};
        var color = get(polyStyle[0], 'color');
        if (color) {
          style.polyStyle.color = nodeVal(color[0]);
        }
      }
       
      styleIndex[styleId] = style;
    }

    // just get top level documents for now
    var documents = xpath.select("kml/Folder/Document", doc);
    for (var d = 0; d < documents.length; d++) {
      var featureCollection = fc();

      var placemarks = get(documents[d], 'Placemark');
      for (var p = 0; p < placemarks.length; p++) {
        featureCollection.features = featureCollection.features.concat(getPlacemark(placemarks[p]));
      }

      var lineStrings = get(documents[d], 'LineString');
      for (var p = 0; p < lineStrings.length; p++) {
        featureCollection.features = featureCollection.features.concat(getPlacemark(lineStrings[p].parentNode));
      }

      featureCollections.push({
        name: xpath.select('name/text()', documents[d]).toString(),
        featureCollection: featureCollection
      });
    }

    // just get top level folders for now
    var folders = xpath.select("kml/Folder/Folder", doc);
    for (var j = 0; j < folders.length; j++) {
      if (xpath.select('ScreenOverlay', folders[j]).length > 0) continue;

      var featureCollection = fc();
      var placemarks = get(folders[j], 'Placemark');
      for (var p = 0; p < placemarks.length; p++) {
        var placemark = getPlacemark(placemarks[p]);
        featureCollection.features = featureCollection.features.concat();
      }

      var lineStrings = get(folders[j], 'LineString');
      for (var p = 0; p < lineStrings.length; p++) {
        var placemark = getPlacemark(lineStrings[p].parentNode);
        featureCollection.features = featureCollection.features.concat(placemark);
      }

      featureCollections.push({
        name: xpath.select('name/text()', folders[j]).toString(),
        featureCollection: featureCollection
      });
    }

    function getGeometry(root) {
        var geomNode, geomNodes, i, j, k, geoms = [];
        if (get1(root, 'MultiGeometry')) return getGeometry(get1(root, 'MultiGeometry'));
        if (get1(root, 'MultiTrack')) return getGeometry(get1(root, 'MultiTrack'));
        for (i = 0; i < geotypes.length; i++) {
            geomNodes = get(root, geotypes[i]);
            if (geomNodes) {
                for (j = 0; j < geomNodes.length; j++) {
                    geomNode = geomNodes[j];
                    if (geotypes[i] == 'Point') {
                        geoms.push({
                            type: 'Point',
                            coordinates: coord1(nodeVal(get1(geomNode, 'coordinates')))
                        });
                    } else if (geotypes[i] == 'LineString') {
                        geoms.push({
                            type: 'LineString',
                            coordinates: coord(nodeVal(get1(geomNode, 'coordinates')))
                        });
                    } else if (geotypes[i] == 'Polygon') {
                        var rings = get(geomNode, 'LinearRing'),
                            coords = [];
                        for (k = 0; k < rings.length; k++) {
                            coords.push(coord(nodeVal(get1(rings[k], 'coordinates'))));
                        }
                        geoms.push({
                            type: 'Polygon',
                            coordinates: coords
                        });
                    } else if (geotypes[i] == 'Track') {
                        geoms.push({
                            type: 'LineString',
                            coordinates: gxCoords(geomNode)
                        });
                    }
                }
            }
        }

        return geoms;
    }
    function getPlacemark(root) {
        var geoms = getGeometry(root), i, properties = {},
            name = nodeVal(get1(root, 'name')),
            styleUrl = nodeVal(get1(root, 'styleUrl')),
            description = nodeVal(get1(root, 'description')),
            extendedData = get1(root, 'ExtendedData');

        if (!geoms.length) return [];
        if (name) properties.name = name;
        if (styleUrl && styleIndex[styleUrl]) {
            properties.style = styleIndex[styleUrl];
        }
        if (description) properties.description = description;
        if (extendedData) {
            var datas = get(extendedData, 'Data'),
                simpleDatas = get(extendedData, 'SimpleData');

            for (i = 0; i < datas.length; i++) {
                properties[datas[i].getAttribute('name')] = nodeVal(get1(datas[i], 'value'));
            }
            for (i = 0; i < simpleDatas.length; i++) {
                properties[simpleDatas[i].getAttribute('name')] = nodeVal(simpleDatas[i]);
            }
        }
        return [{
            type: 'Feature',
            geometry: (geoms.length === 1) ? geoms[0] : {
                type: 'GeometryCollection',
                geometries: geoms
            },
            properties: properties
        }];
    }

    return featureCollections;
}

exports.kml = kml;