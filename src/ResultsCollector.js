const AJONEUVONTIEDOT = 'kehys.sanoma.ajoneuvontiedot';
const AJONEUVONTIEDOT_LAAJA = `${AJONEUVONTIEDOT}.laaja.tunnus`;
const AJONEUVONTIEDOT_HISTORIA = `${AJONEUVONTIEDOT}.historia.tunnus`;

const _ = require('lodash');
const parser = require('fast-xml-parser');;

class ResultsCollector {
	constructor () {
		this.items = {};
	}

	get parsed () {
		return _.mapValues(this.items, parser.parse);
	};

	addOrUpdate (file, text) {
		this.items[file] = text;
	};

	remove (file) {
		delete this.items[file];
	};

	getByReg (value, raw = true) {
		let index = _.findKey(this.parsed, [`${AJONEUVONTIEDOT_LAAJA}.rekisteritunnus`, value]);

		if (_.isUndefined(index)) {
			index = _.findKey(this.parsed, [`${AJONEUVONTIEDOT_HISTORIA}.rekisteritunnus`, value]);
		}

		return raw ? this.items[index] : this.parsed[index];
	};

	getByVin (value, raw = true) {
		let index = _.findKey(this.parsed, [`${AJONEUVONTIEDOT_LAAJA}.valmistenumero`, value]);

		if (_.isUndefined(index)) {
			index = _.findKey(this.parsed, [`${AJONEUVONTIEDOT_HISTORIA}.valmistenumero`, value]);
		}

		return raw ? this.items[index] : this.parsed[index];
	};
}

module.exports = new ResultsCollector;