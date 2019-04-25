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
		const xml = parser.parse(text);
		let value, key;

		if (!xml) return false;

		if (value = _.get(xml, `${AJONEUVONTIEDOT_LAAJA}.rekisteritunnus`)) {
			if (key = _.findKey(this.parsed, [`${AJONEUVONTIEDOT_LAAJA}.rekisteritunnus`, value])) {
				this.remove(key);
			}
		} else if (value = _.get(xml, `${AJONEUVONTIEDOT_HISTORIA}.rekisteritunnus`)) {
			if (key = _.findKey(this.parsed, [`${AJONEUVONTIEDOT_HISTORIA}.rekisteritunnus`, value])) {
				this.remove(key);
			}
		} else if (value = _.get(xml, `${AJONEUVONTIEDOT_LAAJA}.valmistenumero`)) {
			if (key = _.findKey(this.parsed, [`${AJONEUVONTIEDOT_LAAJA}.valmistenumero`, value])) {
				this.remove(key);
			}
		} else if (value = _.get(xml, `${AJONEUVONTIEDOT_HISTORIA}.valmistenumero`)) {
			if (key = _.findKey(this.parsed, [`${AJONEUVONTIEDOT_HISTORIA}.valmistenumero`, value])) {
				this.remove(key);
			}
		}

		this.items[file] = text;

		return { replaced: key };
	};

	remove (file) {
		return delete this.items[file];
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