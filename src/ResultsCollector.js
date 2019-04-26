const AJONEUVONTIEDOT = 'kehys.sanoma.ajoneuvontiedot';
const AJONEUVONTIEDOT_LAAJA = `${AJONEUVONTIEDOT}.laaja.tunnus`;
const AJONEUVONTIEDOT_HISTORIA = `${AJONEUVONTIEDOT}.historia.tunnus`;

const _ = require('lodash');
const parser = require('fast-xml-parser');;

class ResultsCollector {
	constructor(responses_path) {
		this.responses_path = responses_path;
		this.items = {};
	}

	get parsed() {
		return _.mapValues(this.items, item => parser.parse(item.text));
	};

	addOrUpdate(file, text, last_modified, force_overwrite = false) {
		const xml = parser.parse(text);

		if (!xml) return false;

		const add_new = () => {
			this.items[file] = {
				last_modified,
				text
			};
		};
		
		const get_last_modified = old_file => {
			return _.get(this.items, [old_file, 'last_modified']);
		};
		
		const lookup_old_file_by_key = key => {
			let found_value, old_file;

			if (found_value = _.get(xml, key)) {
				if (old_file = this.findKey(key, found_value)) {
					return old_file;
				}
			}
			
			return false;
		};

		const old_file = (
			lookup_old_file_by_key(`${AJONEUVONTIEDOT_LAAJA}.rekisteritunnus`) ||
			lookup_old_file_by_key(`${AJONEUVONTIEDOT_HISTORIA}.rekisteritunnus`) ||
			lookup_old_file_by_key(`${AJONEUVONTIEDOT_LAAJA}.valmistenumero`) ||
			lookup_old_file_by_key(`${AJONEUVONTIEDOT_HISTORIA}.valmistenumero`)
		);

		if (!old_file) add_new();
		else if (force_overwrite || get_last_modified(old_file) < last_modified) {
			this.remove(old_file);
			add_new();
		}

		return {
			replaced: old_file
		};
	};

	findKey (path, value) {
		return _.findKey(this.parsed, [path, value]);
	};
	
	getParsed (file) {
		return _.get(this.parsed, file);
	};
	
	remove(file) {
		return delete this.items[file];
	};

	getByReg(value, raw = true) {
		let index = this.findKey(`${AJONEUVONTIEDOT_LAAJA}.rekisteritunnus`, value);

		if (_.isUndefined(index)) {
			index = this.findKey(`${AJONEUVONTIEDOT_HISTORIA}.rekisteritunnus`, value);
		}

		return raw ? this.items[index] : this.parsed[index];
	};

	getByVin(value, raw = true) {
		let index = this.findKey(`${AJONEUVONTIEDOT_LAAJA}.valmistenumero`, value);

		if (_.isUndefined(index)) {
			index = this.findKey(`${AJONEUVONTIEDOT_HISTORIA}.valmistenumero`, value);
		}

		return raw ? this.items[index] : this.parsed[index];
	};
}

module.exports = ResultsCollector;