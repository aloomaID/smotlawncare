/**
 * Owl Carousel v2.2.1
 * Copyright 2013-2017 David Deutsch
 * Licensed under  ()
 */
/**
 * Owl carousel
 * @version 2.1.6
 * @author Bartosz Wojciechowski
 * @author David Deutsch
 * @license The MIT License (MIT)
 * @todo Lazy Load Icon
 * @todo prevent animationend bubling
 * @todo itemsScaleUp
 * @todo Test Zepto
 * @todo stagePadding calculate wrong active classes
 */
;(function($, window, document, undefined) {

	/**
	 * Creates a carousel.
	 * @class The Owl Carousel.
	 * @public
	 * @param {HTMLElement|jQuery} element - The element to create the carousel for.
	 * @param {Object} [options] - The options
	 */
	function Owl(element, options) {

		/**
		 * Current settings for the carousel.
		 * @public
		 */
		this.settings = null;

		/**
		 * Current options set by the caller including defaults.
		 * @public
		 */
		this.options = $.extend({}, Owl.Defaults, options);

		/**
		 * Plugin element.
		 * @public
		 */
		this.$element = $(element);

		/**
		 * Proxied event handlers.
		 * @protected
		 */
		this._handlers = {};

		/**
		 * References to the running plugins of this carousel.
		 * @protected
		 */
		this._plugins = {};

		/**
		 * Currently suppressed events to prevent them from beeing retriggered.
		 * @protected
		 */
		this._supress = {};

		/**
		 * Absolute current position.
		 * @protected
		 */
		this._current = null;

		/**
		 * Animation speed in milliseconds.
		 * @protected
		 */
		this._speed = null;

		/**
		 * Coordinates of all items in pixel.
		 * @todo The name of this member is missleading.
		 * @protected
		 */
		this._coordinates = [];

		/**
		 * Current breakpoint.
		 * @todo Real media queries would be nice.
		 * @protected
		 */
		this._breakpoint = null;

		/**
		 * Current width of the plugin element.
		 */
		this._width = null;

		/**
		 * All real items.
		 * @protected
		 */
		this._items = [];

		/**
		 * All cloned items.
		 * @protected
		 */
		this._clones = [];

		/**
		 * Merge values of all items.
		 * @todo Maybe this could be part of a plugin.
		 * @protected
		 */
		this._mergers = [];

		/**
		 * Widths of all items.
		 */
		this._widths = [];

		/**
		 * Invalidated parts within the update process.
		 * @protected
		 */
		this._invalidated = {};

		/**
		 * Ordered list of workers for the update process.
		 * @protected
		 */
		this._pipe = [];

		/**
		 * Current state information for the drag operation.
		 * @todo #261
		 * @protected
		 */
		this._drag = {
			time: null,
			target: null,
			pointer: null,
			stage: {
				start: null,
				current: null
			},
			direction: null
		};

		/**
		 * Current state information and their tags.
		 * @type {Object}
		 * @protected
		 */
		this._states = {
			current: {},
			tags: {
				'initializing': [ 'busy' ],
				'animating': [ 'busy' ],
				'dragging': [ 'interacting' ]
			}
		};

		$.each([ 'onResize', 'onThrottledResize' ], $.proxy(function(i, handler) {
			this._handlers[handler] = $.proxy(this[handler], this);
		}, this));

		$.each(Owl.Plugins, $.proxy(function(key, plugin) {
			this._plugins[key.charAt(0).toLowerCase() + key.slice(1)]
				= new plugin(this);
		}, this));

		$.each(Owl.Workers, $.proxy(function(priority, worker) {
			this._pipe.push({
				'filter': worker.filter,
				'run': $.proxy(worker.run, this)
			});
		}, this));

		this.setup();
		this.initialize();
	}

	/**
	 * Default options for the carousel.
	 * @public
	 */
	Owl.Defaults = {
		items: 3,
		loop: false,
		center: false,
		rewind: false,

		mouseDrag: true,
		touchDrag: true,
		pullDrag: true,
		freeDrag: false,

		margin: 0,
		stagePadding: 0,

		merge: false,
		mergeFit: true,
		autoWidth: false,

		startPosition: 0,
		rtl: false,

		smartSpeed: 250,
		fluidSpeed: false,
		dragEndSpeed: false,

		responsive: {},
		responsiveRefreshRate: 200,
		responsiveBaseElement: window,

		fallbackEasing: 'swing',

		info: false,

		nestedItemSelector: false,
		itemElement: 'div',
		stageElement: 'div',

		refreshClass: 'owl-refresh',
		loadedClass: 'owl-loaded',
		loadingClass: 'owl-loading',
		rtlClass: 'owl-rtl',
		responsiveClass: 'owl-responsive',
		dragClass: 'owl-drag',
		itemClass: 'owl-item',
		stageClass: 'owl-stage',
		stageOuterClass: 'owl-stage-outer',
		grabClass: 'owl-grab'
	};

	/**
	 * Enumeration for width.
	 * @public
	 * @readonly
	 * @enum {String}
	 */
	Owl.Width = {
		Default: 'default',
		Inner: 'inner',
		Outer: 'outer'
	};

	/**
	 * Enumeration for types.
	 * @public
	 * @readonly
	 * @enum {String}
	 */
	Owl.Type = {
		Event: 'event',
		State: 'state'
	};

	/**
	 * Contains all registered plugins.
	 * @public
	 */
	Owl.Plugins = {};

	/**
	 * List of workers involved in the update process.
	 */
	Owl.Workers = [ {
		filter: [ 'width', 'settings' ],
		run: function() {
			this._width = this.$element.width();
		}
	}, {
		filter: [ 'width', 'items', 'settings' ],
		run: function(cache) {
			cache.current = this._items && this._items[this.relative(this._current)];
		}
	}, {
		filter: [ 'items', 'settings' ],
		run: function() {
			this.$stage.children('.cloned').remove();
		}
	}, {
		filter: [ 'width', 'items', 'settings' ],
		run: function(cache) {
			var margin = this.settings.margin || '',
				grid = !this.settings.autoWidth,
				rtl = this.settings.rtl,
				css = {
					'width': 'auto',
					'margin-left': rtl ? margin : '',
					'margin-right': rtl ? '' : margin
				};

			!grid && this.$stage.children().css(css);

			cache.css = css;
		}
	}, {
		filter: [ 'width', 'items', 'settings' ],
		run: function(cache) {
			var width = (this.width() / this.settings.items).toFixed(3) - this.settings.margin,
				merge = null,
				iterator = this._items.length,
				grid = !this.settings.autoWidth,
				widths = [];

			cache.items = {
				merge: false,
				width: width
			};

			while (iterator--) {
				merge = this._mergers[iterator];
				merge = this.settings.mergeFit && Math.min(merge, this.settings.items) || merge;

				cache.items.merge = merge > 1 || cache.items.merge;

				widths[iterator] = !grid ? this._items[iterator].width() : width * merge;
			}

			this._widths = widths;
		}
	}, {
		filter: [ 'items', 'settings' ],
		run: function() {
			var clones = [],
				items = this._items,
				settings = this.settings,
				// TODO: Should be computed from number of min width items in stage
				view = Math.max(settings.items * 2, 4),
				size = Math.ceil(items.length / 2) * 2,
				repeat = settings.loop && items.length ? settings.rewind ? view : Math.max(view, size) : 0,
				append = '',
				prepend = '';

			repeat /= 2;

			while (repeat--) {
				// Switch to only using appended clones
				clones.push(this.normalize(clones.length / 2, true));
				append = append + items[clones[clones.length - 1]][0].outerHTML;
				clones.push(this.normalize(items.length - 1 - (clones.length - 1) / 2, true));
				prepend = items[clones[clones.length - 1]][0].outerHTML + prepend;
			}

			this._clones = clones;

			$(append).addClass('cloned').appendTo(this.$stage);
			$(prepend).addClass('cloned').prependTo(this.$stage);
		}
	}, {
		filter: [ 'width', 'items', 'settings' ],
		run: function() {
			var rtl = this.settings.rtl ? 1 : -1,
				size = this._clones.length + this._items.length,
				iterator = -1,
				previous = 0,
				current = 0,
				coordinates = [];

			while (++iterator < size) {
				previous = coordinates[iterator - 1] || 0;
				current = this._widths[this.relative(iterator)] + this.settings.margin;
				coordinates.push(previous + current * rtl);
			}

			this._coordinates = coordinates;
		}
	}, {
		filter: [ 'width', 'items', 'settings' ],
		run: function() {
			var padding = this.settings.stagePadding,
				coordinates = this._coordinates,
				css = {
					'width': Math.ceil(Math.abs(coordinates[coordinates.length - 1])) + padding * 2,
					'padding-left': padding || '',
					'padding-right': padding || ''
				};

			this.$stage.css(css);
		}
	}, {
		filter: [ 'width', 'items', 'settings' ],
		run: function(cache) {
			var iterator = this._coordinates.length,
				grid = !this.settings.autoWidth,
				items = this.$stage.children();

			if (grid && cache.items.merge) {
				while (iterator--) {
					cache.css.width = this._widths[this.relative(iterator)];
					items.eq(iterator).css(cache.css);
				}
			} else if (grid) {
				cache.css.width = cache.items.width;
				items.css(cache.css);
			}
		}
	}, {
		filter: [ 'items' ],
		run: function() {
			this._coordinates.length < 1 && this.$stage.removeAttr('style');
		}
	}, {
		filter: [ 'width', 'items', 'settings' ],
		run: function(cache) {
			cache.current = cache.current ? this.$stage.children().index(cache.current) : 0;
			cache.current = Math.max(this.minimum(), Math.min(this.maximum(), cache.current));
			this.reset(cache.current);
		}
	}, {
		filter: [ 'position' ],
		run: function() {
			this.animate(this.coordinates(this._current));
		}
	}, {
		filter: [ 'width', 'position', 'items', 'settings' ],
		run: function() {
			var rtl = this.settings.rtl ? 1 : -1,
				padding = this.settings.stagePadding * 2,
				begin = this.coordinates(this.current()) + padding,
				end = begin + this.width() * rtl,
				inner, outer, matches = [], i, n;

			for (i = 0, n = this._coordinates.length; i < n; i++) {
				inner = this._coordinates[i - 1] || 0;
				outer = Math.abs(this._coordinates[i]) + padding * rtl;

				if ((this.op(inner, '<=', begin) && (this.op(inner, '>', end)))
					|| (this.op(outer, '<', begin) && this.op(outer, '>', end))) {
					matches.push(i);
				}
			}

			this.$stage.children('.active').removeClass('active');
			this.$stage.children(':eq(' + matches.join('), :eq(') + ')').addClass('active');

			if (this.settings.center) {
				this.$stage.children('.center').removeClass('center');
				this.$stage.children().eq(this.current()).addClass('center');
			}
		}
	} ];

	/**
	 * Initializes the carousel.
	 * @protected
	 */
	Owl.prototype.initialize = function() {
		this.enter('initializing');
		this.trigger('initialize');

		this.$element.toggleClass(this.settings.rtlClass, this.settings.rtl);

		if (this.settings.autoWidth && !this.is('pre-loading')) {
			var imgs, nestedSelector, width;
			imgs = this.$element.find('img');
			nestedSelector = this.settings.nestedItemSelector ? '.' + this.settings.nestedItemSelector : undefined;
			width = this.$element.children(nestedSelector).width();

			if (imgs.length && width <= 0) {
				this.preloadAutoWidthImages(imgs);
			}
		}

		this.$element.addClass(this.options.loadingClass);

		// create stage
		this.$stage = $('<' + this.settings.stageElement + ' class="' + this.settings.stageClass + '"/>')
			.wrap('<div class="' + this.settings.stageOuterClass + '"/>');

		// append stage
		this.$element.append(this.$stage.parent());

		// append content
		this.replace(this.$element.children().not(this.$stage.parent()));

		// check visibility
		if (this.$element.is(':visible')) {
			// update view
			this.refresh();
		} else {
			// invalidate width
			this.invalidate('width');
		}

		this.$element
			.removeClass(this.options.loadingClass)
			.addClass(this.options.loadedClass);

		// register event handlers
		this.registerEventHandlers();

		this.leave('initializing');
		this.trigger('initialized');
	};

	/**
	 * Setups the current settings.
	 * @todo Remove responsive classes. Why should adaptive designs be brought into IE8?
	 * @todo Support for media queries by using `matchMedia` would be nice.
	 * @public
	 */
	Owl.prototype.setup = function() {
		var viewport = this.viewport(),
			overwrites = this.options.responsive,
			match = -1,
			settings = null;

		if (!overwrites) {
			settings = $.extend({}, this.options);
		} else {
			$.each(overwrites, function(breakpoint) {
				if (breakpoint <= viewport && breakpoint > match) {
					match = Number(breakpoint);
				}
			});

			settings = $.extend({}, this.options, overwrites[match]);
			if (typeof settings.stagePadding === 'function') {
				settings.stagePadding = settings.stagePadding();
			}
			delete settings.responsive;

			// responsive class
			if (settings.responsiveClass) {
				this.$element.attr('class',
					this.$element.attr('class').replace(new RegExp('(' + this.options.responsiveClass + '-)\\S+\\s', 'g'), '$1' + match)
				);
			}
		}

		this.trigger('change', { property: { name: 'settings', value: settings } });
		this._breakpoint = match;
		this.settings = settings;
		this.invalidate('settings');
		this.trigger('changed', { property: { name: 'settings', value: this.settings } });
	};

	/**
	 * Updates option logic if necessery.
	 * @protected
	 */
	Owl.prototype.optionsLogic = function() {
		if (this.settings.autoWidth) {
			this.settings.stagePadding = false;
			this.settings.merge = false;
		}
	};

	/**
	 * Prepares an item before add.
	 * @todo Rename event parameter `content` to `item`.
	 * @protected
	 * @returns {jQuery|HTMLElement} - The item container.
	 */
	Owl.prototype.prepare = function(item) {
		var event = this.trigger('prepare', { content: item });

		if (!event.data) {
			event.data = $('<' + this.settings.itemElement + '/>')
				.addClass(this.options.itemClass).append(item)
		}

		this.trigger('prepared', { content: event.data });

		return event.data;
	};

	/**
	 * Updates the view.
	 * @public
	 */
	Owl.prototype.update = function() {
		var i = 0,
			n = this._pipe.length,
			filter = $.proxy(function(p) { return this[p] }, this._invalidated),
			cache = {};

		while (i < n) {
			if (this._invalidated.all || $.grep(this._pipe[i].filter, filter).length > 0) {
				this._pipe[i].run(cache);
			}
			i++;
		}

		this._invalidated = {};

		!this.is('valid') && this.enter('valid');
	};

	/**
	 * Gets the width of the view.
	 * @public
	 * @param {Owl.Width} [dimension=Owl.Width.Default] - The dimension to return.
	 * @returns {Number} - The width of the view in pixel.
	 */
	Owl.prototype.width = function(dimension) {
		dimension = dimension || Owl.Width.Default;
		switch (dimension) {
			case Owl.Width.Inner:
			case Owl.Width.Outer:
				return this._width;
			default:
				return this._width - this.settings.stagePadding * 2 + this.settings.margin;
		}
	};

	/**
	 * Refreshes the carousel primarily for adaptive purposes.
	 * @public
	 */
	Owl.prototype.refresh = function() {
		this.enter('refreshing');
		this.trigger('refresh');

		this.setup();

		this.optionsLogic();

		this.$element.addClass(this.options.refreshClass);

		this.update();

		this.$element.removeClass(this.options.refreshClass);

		this.leave('refreshing');
		this.trigger('refreshed');
	};

	/**
	 * Checks window `resize` event.
	 * @protected
	 */
	Owl.prototype.onThrottledResize = function() {
		window.clearTimeout(this.resizeTimer);
		this.resizeTimer = window.setTimeout(this._handlers.onResize, this.settings.responsiveRefreshRate);
	};

	/**
	 * Checks window `resize` event.
	 * @protected
	 */
	Owl.prototype.onResize = function() {
		if (!this._items.length) {
			return false;
		}

		if (this._width === this.$element.width()) {
			return false;
		}

		if (!this.$element.is(':visible')) {
			return false;
		}

		this.enter('resizing');

		if (this.trigger('resize').isDefaultPrevented()) {
			this.leave('resizing');
			return false;
		}

		this.invalidate('width');

		this.refresh();

		this.leave('resizing');
		this.trigger('resized');
	};

	/**
	 * Registers event handlers.
	 * @todo Check `msPointerEnabled`
	 * @todo #261
	 * @protected
	 */
	Owl.prototype.registerEventHandlers = function() {
		if ($.support.transition) {
			this.$stage.on($.support.transition.end + '.owl.core', $.proxy(this.onTransitionEnd, this));
		}

		if (this.settings.responsive !== false) {
			this.on(window, 'resize', this._handlers.onThrottledResize);
		}

		if (this.settings.mouseDrag) {
			this.$element.addClass(this.options.dragClass);
			this.$stage.on('mousedown.owl.core', $.proxy(this.onDragStart, this));
			this.$stage.on('dragstart.owl.core selectstart.owl.core', function() { return false });
		}

		if (this.settings.touchDrag){
			this.$stage.on('touchstart.owl.core', $.proxy(this.onDragStart, this));
			this.$stage.on('touchcancel.owl.core', $.proxy(this.onDragEnd, this));
		}
	};

	/**
	 * Handles `touchstart` and `mousedown` events.
	 * @todo Horizontal swipe threshold as option
	 * @todo #261
	 * @protected
	 * @param {Event} event - The event arguments.
	 */
	Owl.prototype.onDragStart = function(event) {
		var stage = null;

		if (event.which === 3) {
			return;
		}

		if ($.support.transform) {
			stage = this.$stage.css('transform').replace(/.*\(|\)| /g, '').split(',');
			stage = {
				x: stage[stage.length === 16 ? 12 : 4],
				y: stage[stage.length === 16 ? 13 : 5]
			};
		} else {
			stage = this.$stage.position();
			stage = {
				x: this.settings.rtl ?
					stage.left + this.$stage.width() - this.width() + this.settings.margin :
					stage.left,
				y: stage.top
			};
		}

		if (this.is('animating')) {
			$.support.transform ? this.animate(stage.x) : this.$stage.stop()
			this.invalidate('position');
		}

		this.$element.toggleClass(this.options.grabClass, event.type === 'mousedown');

		this.speed(0);

		this._drag.time = new Date().getTime();
		this._drag.target = $(event.target);
		this._drag.stage.start = stage;
		this._drag.stage.current = stage;
		this._drag.pointer = this.pointer(event);

		$(document).on('mouseup.owl.core touchend.owl.core', $.proxy(this.onDragEnd, this));

		$(document).one('mousemove.owl.core touchmove.owl.core', $.proxy(function(event) {
			var delta = this.difference(this._drag.pointer, this.pointer(event));

			$(document).on('mousemove.owl.core touchmove.owl.core', $.proxy(this.onDragMove, this));

			if (Math.abs(delta.x) < Math.abs(delta.y) && this.is('valid')) {
				return;
			}

			event.preventDefault();

			this.enter('dragging');
			this.trigger('drag');
		}, this));
	};

	/**
	 * Handles the `touchmove` and `mousemove` events.
	 * @todo #261
	 * @protected
	 * @param {Event} event - The event arguments.
	 */
	Owl.prototype.onDragMove = function(event) {
		var minimum = null,
			maximum = null,
			pull = null,
			delta = this.difference(this._drag.pointer, this.pointer(event)),
			stage = this.difference(this._drag.stage.start, delta);

		if (!this.is('dragging')) {
			return;
		}

		event.preventDefault();

		if (this.settings.loop) {
			minimum = this.coordinates(this.minimum());
			maximum = this.coordinates(this.maximum() + 1) - minimum;
			stage.x = (((stage.x - minimum) % maximum + maximum) % maximum) + minimum;
		} else {
			minimum = this.settings.rtl ? this.coordinates(this.maximum()) : this.coordinates(this.minimum());
			maximum = this.settings.rtl ? this.coordinates(this.minimum()) : this.coordinates(this.maximum());
			pull = this.settings.pullDrag ? -1 * delta.x / 5 : 0;
			stage.x = Math.max(Math.min(stage.x, minimum + pull), maximum + pull);
		}

		this._drag.stage.current = stage;

		this.animate(stage.x);
	};

	/**
	 * Handles the `touchend` and `mouseup` events.
	 * @todo #261
	 * @todo Threshold for click event
	 * @protected
	 * @param {Event} event - The event arguments.
	 */
	Owl.prototype.onDragEnd = function(event) {
		var delta = this.difference(this._drag.pointer, this.pointer(event)),
			stage = this._drag.stage.current,
			direction = delta.x > 0 ^ this.settings.rtl ? 'left' : 'right';

		$(document).off('.owl.core');

		this.$element.removeClass(this.options.grabClass);

		if (delta.x !== 0 && this.is('dragging') || !this.is('valid')) {
			this.speed(this.settings.dragEndSpeed || this.settings.smartSpeed);
			this.current(this.closest(stage.x, delta.x !== 0 ? direction : this._drag.direction));
			this.invalidate('position');
			this.update();

			this._drag.direction = direction;

			if (Math.abs(delta.x) > 3 || new Date().getTime() - this._drag.time > 300) {
				this._drag.target.one('click.owl.core', function() { return false; });
			}
		}

		if (!this.is('dragging')) {
			return;
		}

		this.leave('dragging');
		this.trigger('dragged');
	};

	/**
	 * Gets absolute position of the closest item for a coordinate.
	 * @todo Setting `freeDrag` makes `closest` not reusable. See #165.
	 * @protected
	 * @param {Number} coordinate - The coordinate in pixel.
	 * @param {String} direction - The direction to check for the closest item. Ether `left` or `right`.
	 * @return {Number} - The absolute position of the closest item.
	 */
	Owl.prototype.closest = function(coordinate, direction) {
		var position = -1,
			pull = 30,
			width = this.width(),
			coordinates = this.coordinates();

		if (!this.settings.freeDrag) {
			// check closest item
			$.each(coordinates, $.proxy(function(index, value) {
				// on a left pull, check on current index
				if (direction === 'left' && coordinate > value - pull && coordinate < value + pull) {
					position = index;
				// on a right pull, check on previous index
				// to do so, subtract width from value and set position = index + 1
				} else if (direction === 'right' && coordinate > value - width - pull && coordinate < value - width + pull) {
					position = index + 1;
				} else if (this.op(coordinate, '<', value)
					&& this.op(coordinate, '>', coordinates[index + 1] || value - width)) {
					position = direction === 'left' ? index + 1 : index;
				}
				return position === -1;
			}, this));
		}

		if (!this.settings.loop) {
			// non loop boundries
			if (this.op(coordinate, '>', coordinates[this.minimum()])) {
				position = coordinate = this.minimum();
			} else if (this.op(coordinate, '<', coordinates[this.maximum()])) {
				position = coordinate = this.maximum();
			}
		}

		return position;
	};

	/**
	 * Animates the stage.
	 * @todo #270
	 * @public
	 * @param {Number} coordinate - The coordinate in pixels.
	 */
	Owl.prototype.animate = function(coordinate) {
		var animate = this.speed() > 0;

		this.is('animating') && this.onTransitionEnd();

		if (animate) {
			this.enter('animating');
			this.trigger('translate');
		}

		if ($.support.transform3d && $.support.transition) {
			this.$stage.css({
				transform: 'translate3d(' + coordinate + 'px,0px,0px)',
				transition: (this.speed() / 1000) + 's'
			});
		} else if (animate) {
			this.$stage.animate({
				left: coordinate + 'px'
			}, this.speed(), this.settings.fallbackEasing, $.proxy(this.onTransitionEnd, this));
		} else {
			this.$stage.css({
				left: coordinate + 'px'
			});
		}
	};

	/**
	 * Checks whether the carousel is in a specific state or not.
	 * @param {String} state - The state to check.
	 * @returns {Boolean} - The flag which indicates if the carousel is busy.
	 */
	Owl.prototype.is = function(state) {
		return this._states.current[state] && this._states.current[state] > 0;
	};

	/**
	 * Sets the absolute position of the current item.
	 * @public
	 * @param {Number} [position] - The new absolute position or nothing to leave it unchanged.
	 * @returns {Number} - The absolute position of the current item.
	 */
	Owl.prototype.current = function(position) {
		if (position === undefined) {
			return this._current;
		}

		if (this._items.length === 0) {
			return undefined;
		}

		position = this.normalize(position);

		if (this._current !== position) {
			var event = this.trigger('change', { property: { name: 'position', value: position } });

			if (event.data !== undefined) {
				position = this.normalize(event.data);
			}

			this._current = position;

			this.invalidate('position');

			this.trigger('changed', { property: { name: 'position', value: this._current } });
		}

		return this._current;
	};

	/**
	 * Invalidates the given part of the update routine.
	 * @param {String} [part] - The part to invalidate.
	 * @returns {Array.<String>} - The invalidated parts.
	 */
	Owl.prototype.invalidate = function(part) {
		if ($.type(part) === 'string') {
			this._invalidated[part] = true;
			this.is('valid') && this.leave('valid');
		}
		return $.map(this._invalidated, function(v, i) { return i });
	};

	/**
	 * Resets the absolute position of the current item.
	 * @public
	 * @param {Number} position - The absolute position of the new item.
	 */
	Owl.prototype.reset = function(position) {
		position = this.normalize(position);

		if (position === undefined) {
			return;
		}

		this._speed = 0;
		this._current = position;

		this.suppress([ 'translate', 'translated' ]);

		this.animate(this.coordinates(position));

		this.release([ 'translate', 'translated' ]);
	};

	/**
	 * Normalizes an absolute or a relative position of an item.
	 * @public
	 * @param {Number} position - The absolute or relative position to normalize.
	 * @param {Boolean} [relative=false] - Whether the given position is relative or not.
	 * @returns {Number} - The normalized position.
	 */
	Owl.prototype.normalize = function(position, relative) {
		var n = this._items.length,
			m = relative ? 0 : this._clones.length;

		if (!this.isNumeric(position) || n < 1) {
			position = undefined;
		} else if (position < 0 || position >= n + m) {
			position = ((position - m / 2) % n + n) % n + m / 2;
		}

		return position;
	};

	/**
	 * Converts an absolute position of an item into a relative one.
	 * @public
	 * @param {Number} position - The absolute position to convert.
	 * @returns {Number} - The converted position.
	 */
	Owl.prototype.relative = function(position) {
		position -= this._clones.length / 2;
		return this.normalize(position, true);
	};

	/**
	 * Gets the maximum position for the current item.
	 * @public
	 * @param {Boolean} [relative=false] - Whether to return an absolute position or a relative position.
	 * @returns {Number}
	 */
	Owl.prototype.maximum = function(relative) {
		var settings = this.settings,
			maximum = this._coordinates.length,
			iterator,
			reciprocalItemsWidth,
			elementWidth;

		if (settings.loop) {
			maximum = this._clones.length / 2 + this._items.length - 1;
		} else if (settings.autoWidth || settings.merge) {
			iterator = this._items.length;
			reciprocalItemsWidth = this._items[--iterator].width();
			elementWidth = this.$element.width();
			while (iterator--) {
				reciprocalItemsWidth += this._items[iterator].width() + this.settings.margin;
				if (reciprocalItemsWidth > elementWidth) {
					break;
				}
			}
			maximum = iterator + 1;
		} else if (settings.center) {
			maximum = this._items.length - 1;
		} else {
			maximum = this._items.length - settings.items;
		}

		if (relative) {
			maximum -= this._clones.length / 2;
		}

		return Math.max(maximum, 0);
	};

	/**
	 * Gets the minimum position for the current item.
	 * @public
	 * @param {Boolean} [relative=false] - Whether to return an absolute position or a relative position.
	 * @returns {Number}
	 */
	Owl.prototype.minimum = function(relative) {
		return relative ? 0 : this._clones.length / 2;
	};

	/**
	 * Gets an item at the specified relative position.
	 * @public
	 * @param {Number} [position] - The relative position of the item.
	 * @return {jQuery|Array.<jQuery>} - The item at the given position or all items if no position was given.
	 */
	Owl.prototype.items = function(position) {
		if (position === undefined) {
			return this._items.slice();
		}

		position = this.normalize(position, true);
		return this._items[position];
	};

	/**
	 * Gets an item at the specified relative position.
	 * @public
	 * @param {Number} [position] - The relative position of the item.
	 * @return {jQuery|Array.<jQuery>} - The item at the given position or all items if no position was given.
	 */
	Owl.prototype.mergers = function(position) {
		if (position === undefined) {
			return this._mergers.slice();
		}

		position = this.normalize(position, true);
		return this._mergers[position];
	};

	/**
	 * Gets the absolute positions of clones for an item.
	 * @public
	 * @param {Number} [position] - The relative position of the item.
	 * @returns {Array.<Number>} - The absolute positions of clones for the item or all if no position was given.
	 */
	Owl.prototype.clones = function(position) {
		var odd = this._clones.length / 2,
			even = odd + this._items.length,
			map = function(index) { return index % 2 === 0 ? even + index / 2 : odd - (index + 1) / 2 };

		if (position === undefined) {
			return $.map(this._clones, function(v, i) { return map(i) });
		}

		return $.map(this._clones, function(v, i) { return v === position ? map(i) : null });
	};

	/**
	 * Sets the current animation speed.
	 * @public
	 * @param {Number} [speed] - The animation speed in milliseconds or nothing to leave it unchanged.
	 * @returns {Number} - The current animation speed in milliseconds.
	 */
	Owl.prototype.speed = function(speed) {
		if (speed !== undefined) {
			this._speed = speed;
		}

		return this._speed;
	};

	/**
	 * Gets the coordinate of an item.
	 * @todo The name of this method is missleanding.
	 * @public
	 * @param {Number} position - The absolute position of the item within `minimum()` and `maximum()`.
	 * @returns {Number|Array.<Number>} - The coordinate of the item in pixel or all coordinates.
	 */
	Owl.prototype.coordinates = function(position) {
		var multiplier = 1,
			newPosition = position - 1,
			coordinate;

		if (position === undefined) {
			return $.map(this._coordinates, $.proxy(function(coordinate, index) {
				return this.coordinates(index);
			}, this));
		}

		if (this.settings.center) {
			if (this.settings.rtl) {
				multiplier = -1;
				newPosition = position + 1;
			}

			coordinate = this._coordinates[position];
			coordinate += (this.width() - coordinate + (this._coordinates[newPosition] || 0)) / 2 * multiplier;
		} else {
			coordinate = this._coordinates[newPosition] || 0;
		}

		coordinate = Math.ceil(coordinate);

		return coordinate;
	};

	/**
	 * Calculates the speed for a translation.
	 * @protected
	 * @param {Number} from - The absolute position of the start item.
	 * @param {Number} to - The absolute position of the target item.
	 * @param {Number} [factor=undefined] - The time factor in milliseconds.
	 * @returns {Number} - The time in milliseconds for the translation.
	 */
	Owl.prototype.duration = function(from, to, factor) {
		if (factor === 0) {
			return 0;
		}

		return Math.min(Math.max(Math.abs(to - from), 1), 6) * Math.abs((factor || this.settings.smartSpeed));
	};

	/**
	 * Slides to the specified item.
	 * @public
	 * @param {Number} position - The position of the item.
	 * @param {Number} [speed] - The time in milliseconds for the transition.
	 */
	Owl.prototype.to = function(position, speed) {
		var current = this.current(),
			revert = null,
			distance = position - this.relative(current),
			direction = (distance > 0) - (distance < 0),
			items = this._items.length,
			minimum = this.minimum(),
			maximum = this.maximum();

		if (this.settings.loop) {
			if (!this.settings.rewind && Math.abs(distance) > items / 2) {
				distance += direction * -1 * items;
			}

			position = current + distance;
			revert = ((position - minimum) % items + items) % items + minimum;

			if (revert !== position && revert - distance <= maximum && revert - distance > 0) {
				current = revert - distance;
				position = revert;
				this.reset(current);
			}
		} else if (this.settings.rewind) {
			maximum += 1;
			position = (position % maximum + maximum) % maximum;
		} else {
			position = Math.max(minimum, Math.min(maximum, position));
		}

		this.speed(this.duration(current, position, speed));
		this.current(position);

		if (this.$element.is(':visible')) {
			this.update();
		}
	};

	/**
	 * Slides to the next item.
	 * @public
	 * @param {Number} [speed] - The time in milliseconds for the transition.
	 */
	Owl.prototype.next = function(speed) {
		speed = speed || false;
		this.to(this.relative(this.current()) + 1, speed);
	};

	/**
	 * Slides to the previous item.
	 * @public
	 * @param {Number} [speed] - The time in milliseconds for the transition.
	 */
	Owl.prototype.prev = function(speed) {
		speed = speed || false;
		this.to(this.relative(this.current()) - 1, speed);
	};

	/**
	 * Handles the end of an animation.
	 * @protected
	 * @param {Event} event - The event arguments.
	 */
	Owl.prototype.onTransitionEnd = function(event) {

		// if css2 animation then event object is undefined
		if (event !== undefined) {
			event.stopPropagation();

			// Catch only owl-stage transitionEnd event
			if ((event.target || event.srcElement || event.originalTarget) !== this.$stage.get(0)) {
				return false;
			}
		}

		this.leave('animating');
		this.trigger('translated');
	};

	/**
	 * Gets viewport width.
	 * @protected
	 * @return {Number} - The width in pixel.
	 */
	Owl.prototype.viewport = function() {
		var width;
		if (this.options.responsiveBaseElement !== window) {
			width = $(this.options.responsiveBaseElement).width();
		} else if (window.innerWidth) {
			width = window.innerWidth;
		} else if (document.documentElement && document.documentElement.clientWidth) {
			width = document.documentElement.clientWidth;
		} else {
			console.warn('Can not detect viewport width.');
		}
		return width;
	};

	/**
	 * Replaces the current content.
	 * @public
	 * @param {HTMLElement|jQuery|String} content - The new content.
	 */
	Owl.prototype.replace = function(content) {
		this.$stage.empty();
		this._items = [];

		if (content) {
			content = (content instanceof jQuery) ? content : $(content);
		}

		if (this.settings.nestedItemSelector) {
			content = content.find('.' + this.settings.nestedItemSelector);
		}

		content.filter(function() {
			return this.nodeType === 1;
		}).each($.proxy(function(index, item) {
			item = this.prepare(item);
			this.$stage.append(item);
			this._items.push(item);
			this._mergers.push(item.find('[data-merge]').addBack('[data-merge]').attr('data-merge') * 1 || 1);
		}, this));

		this.reset(this.isNumeric(this.settings.startPosition) ? this.settings.startPosition : 0);

		this.invalidate('items');
	};

	/**
	 * Adds an item.
	 * @todo Use `item` instead of `content` for the event arguments.
	 * @public
	 * @param {HTMLElement|jQuery|String} content - The item content to add.
	 * @param {Number} [position] - The relative position at which to insert the item otherwise the item will be added to the end.
	 */
	Owl.prototype.add = function(content, position) {
		var current = this.relative(this._current);

		position = position === undefined ? this._items.length : this.normalize(position, true);
		content = content instanceof jQuery ? content : $(content);

		this.trigger('add', { content: content, position: position });

		content = this.prepare(content);

		if (this._items.length === 0 || position === this._items.length) {
			this._items.length === 0 && this.$stage.append(content);
			this._items.length !== 0 && this._items[position - 1].after(content);
			this._items.push(content);
			this._mergers.push(content.find('[data-merge]').addBack('[data-merge]').attr('data-merge') * 1 || 1);
		} else {
			this._items[position].before(content);
			this._items.splice(position, 0, content);
			this._mergers.splice(position, 0, content.find('[data-merge]').addBack('[data-merge]').attr('data-merge') * 1 || 1);
		}

		this._items[current] && this.reset(this._items[current].index());

		this.invalidate('items');

		this.trigger('added', { content: content, position: position });
	};

	/**
	 * Removes an item by its position.
	 * @todo Use `item` instead of `content` for the event arguments.
	 * @public
	 * @param {Number} position - The relative position of the item to remove.
	 */
	Owl.prototype.remove = function(position) {
		position = this.normalize(position, true);

		if (position === undefined) {
			return;
		}

		this.trigger('remove', { content: this._items[position], position: position });

		this._items[position].remove();
		this._items.splice(position, 1);
		this._mergers.splice(position, 1);

		this.invalidate('items');

		this.trigger('removed', { content: null, position: position });
	};

	/**
	 * Preloads images with auto width.
	 * @todo Replace by a more generic approach
	 * @protected
	 */
	Owl.prototype.preloadAutoWidthImages = function(images) {
		images.each($.proxy(function(i, element) {
			this.enter('pre-loading');
			element = $(element);
			$(new Image()).one('load', $.proxy(function(e) {
				element.attr('src', e.target.src);
				element.css('opacity', 1);
				this.leave('pre-loading');
				!this.is('pre-loading') && !this.is('initializing') && this.refresh();
			}, this)).attr('src', element.attr('src') || element.attr('data-src') || element.attr('data-src-retina'));
		}, this));
	};

	/**
	 * Destroys the carousel.
	 * @public
	 */
	Owl.prototype.destroy = function() {

		this.$element.off('.owl.core');
		this.$stage.off('.owl.core');
		$(document).off('.owl.core');

		if (this.settings.responsive !== false) {
			window.clearTimeout(this.resizeTimer);
			this.off(window, 'resize', this._handlers.onThrottledResize);
		}

		for (var i in this._plugins) {
			this._plugins[i].destroy();
		}

		this.$stage.children('.cloned').remove();

		this.$stage.unwrap();
		this.$stage.children().contents().unwrap();
		this.$stage.children().unwrap();

		this.$element
			.removeClass(this.options.refreshClass)
			.removeClass(this.options.loadingClass)
			.removeClass(this.options.loadedClass)
			.removeClass(this.options.rtlClass)
			.removeClass(this.options.dragClass)
			.removeClass(this.options.grabClass)
			.attr('class', this.$element.attr('class').replace(new RegExp(this.options.responsiveClass + '-\\S+\\s', 'g'), ''))
			.removeData('owl.carousel');
	};

	/**
	 * Operators to calculate right-to-left and left-to-right.
	 * @protected
	 * @param {Number} [a] - The left side operand.
	 * @param {String} [o] - The operator.
	 * @param {Number} [b] - The right side operand.
	 */
	Owl.prototype.op = function(a, o, b) {
		var rtl = this.settings.rtl;
		switch (o) {
			case '<':
				return rtl ? a > b : a < b;
			case '>':
				return rtl ? a < b : a > b;
			case '>=':
				return rtl ? a <= b : a >= b;
			case '<=':
				return rtl ? a >= b : a <= b;
			default:
				break;
		}
	};

	/**
	 * Attaches to an internal event.
	 * @protected
	 * @param {HTMLElement} element - The event source.
	 * @param {String} event - The event name.
	 * @param {Function} listener - The event handler to attach.
	 * @param {Boolean} capture - Wether the event should be handled at the capturing phase or not.
	 */
	Owl.prototype.on = function(element, event, listener, capture) {
		if (element.addEventListener) {
			element.addEventListener(event, listener, capture);
		} else if (element.attachEvent) {
			element.attachEvent('on' + event, listener);
		}
	};

	/**
	 * Detaches from an internal event.
	 * @protected
	 * @param {HTMLElement} element - The event source.
	 * @param {String} event - The event name.
	 * @param {Function} listener - The attached event handler to detach.
	 * @param {Boolean} capture - Wether the attached event handler was registered as a capturing listener or not.
	 */
	Owl.prototype.off = function(element, event, listener, capture) {
		if (element.removeEventListener) {
			element.removeEventListener(event, listener, capture);
		} else if (element.detachEvent) {
			element.detachEvent('on' + event, listener);
		}
	};

	/**
	 * Triggers a public event.
	 * @todo Remove `status`, `relatedTarget` should be used instead.
	 * @protected
	 * @param {String} name - The event name.
	 * @param {*} [data=null] - The event data.
	 * @param {String} [namespace=carousel] - The event namespace.
	 * @param {String} [state] - The state which is associated with the event.
	 * @param {Boolean} [enter=false] - Indicates if the call enters the specified state or not.
	 * @returns {Event} - The event arguments.
	 */
	Owl.prototype.trigger = function(name, data, namespace, state, enter) {
		var status = {
			item: { count: this._items.length, index: this.current() }
		}, handler = $.camelCase(
			$.grep([ 'on', name, namespace ], function(v) { return v })
				.join('-').toLowerCase()
		), event = $.Event(
			[ name, 'owl', namespace || 'carousel' ].join('.').toLowerCase(),
			$.extend({ relatedTarget: this }, status, data)
		);

		if (!this._supress[name]) {
			$.each(this._plugins, function(name, plugin) {
				if (plugin.onTrigger) {
					plugin.onTrigger(event);
				}
			});

			this.register({ type: Owl.Type.Event, name: name });
			this.$element.trigger(event);

			if (this.settings && typeof this.settings[handler] === 'function') {
				this.settings[handler].call(this, event);
			}
		}

		return event;
	};

	/**
	 * Enters a state.
	 * @param name - The state name.
	 */
	Owl.prototype.enter = function(name) {
		$.each([ name ].concat(this._states.tags[name] || []), $.proxy(function(i, name) {
			if (this._states.current[name] === undefined) {
				this._states.current[name] = 0;
			}

			this._states.current[name]++;
		}, this));
	};

	/**
	 * Leaves a state.
	 * @param name - The state name.
	 */
	Owl.prototype.leave = function(name) {
		$.each([ name ].concat(this._states.tags[name] || []), $.proxy(function(i, name) {
			this._states.current[name]--;
		}, this));
	};

	/**
	 * Registers an event or state.
	 * @public
	 * @param {Object} object - The event or state to register.
	 */
	Owl.prototype.register = function(object) {
		if (object.type === Owl.Type.Event) {
			if (!$.event.special[object.name]) {
				$.event.special[object.name] = {};
			}

			if (!$.event.special[object.name].owl) {
				var _default = $.event.special[object.name]._default;
				$.event.special[object.name]._default = function(e) {
					if (_default && _default.apply && (!e.namespace || e.namespace.indexOf('owl') === -1)) {
						return _default.apply(this, arguments);
					}
					return e.namespace && e.namespace.indexOf('owl') > -1;
				};
				$.event.special[object.name].owl = true;
			}
		} else if (object.type === Owl.Type.State) {
			if (!this._states.tags[object.name]) {
				this._states.tags[object.name] = object.tags;
			} else {
				this._states.tags[object.name] = this._states.tags[object.name].concat(object.tags);
			}

			this._states.tags[object.name] = $.grep(this._states.tags[object.name], $.proxy(function(tag, i) {
				return $.inArray(tag, this._states.tags[object.name]) === i;
			}, this));
		}
	};

	/**
	 * Suppresses events.
	 * @protected
	 * @param {Array.<String>} events - The events to suppress.
	 */
	Owl.prototype.suppress = function(events) {
		$.each(events, $.proxy(function(index, event) {
			this._supress[event] = true;
		}, this));
	};

	/**
	 * Releases suppressed events.
	 * @protected
	 * @param {Array.<String>} events - The events to release.
	 */
	Owl.prototype.release = function(events) {
		$.each(events, $.proxy(function(index, event) {
			delete this._supress[event];
		}, this));
	};

	/**
	 * Gets unified pointer coordinates from event.
	 * @todo #261
	 * @protected
	 * @param {Event} - The `mousedown` or `touchstart` event.
	 * @returns {Object} - Contains `x` and `y` coordinates of current pointer position.
	 */
	Owl.prototype.pointer = function(event) {
		var result = { x: null, y: null };

		event = event.originalEvent || event || window.event;

		event = event.touches && event.touches.length ?
			event.touches[0] : event.changedTouches && event.changedTouches.length ?
				event.changedTouches[0] : event;

		if (event.pageX) {
			result.x = event.pageX;
			result.y = event.pageY;
		} else {
			result.x = event.clientX;
			result.y = event.clientY;
		}

		return result;
	};

	/**
	 * Determines if the input is a Number or something that can be coerced to a Number
	 * @protected
	 * @param {Number|String|Object|Array|Boolean|RegExp|Function|Symbol} - The input to be tested
	 * @returns {Boolean} - An indication if the input is a Number or can be coerced to a Number
	 */
	Owl.prototype.isNumeric = function(number) {
		return !isNaN(parseFloat(number));
	};

	/**
	 * Gets the difference of two vectors.
	 * @todo #261
	 * @protected
	 * @param {Object} - The first vector.
	 * @param {Object} - The second vector.
	 * @returns {Object} - The difference.
	 */
	Owl.prototype.difference = function(first, second) {
		return {
			x: first.x - second.x,
			y: first.y - second.y
		};
	};

	/**
	 * The jQuery Plugin for the Owl Carousel
	 * @todo Navigation plugin `next` and `prev`
	 * @public
	 */
	$.fn.owlCarousel = function(option) {
		var args = Array.prototype.slice.call(arguments, 1);

		return this.each(function() {
			var $this = $(this),
				data = $this.data('owl.carousel');

			if (!data) {
				data = new Owl(this, typeof option == 'object' && option);
				$this.data('owl.carousel', data);

				$.each([
					'next', 'prev', 'to', 'destroy', 'refresh', 'replace', 'add', 'remove'
				], function(i, event) {
					data.register({ type: Owl.Type.Event, name: event });
					data.$element.on(event + '.owl.carousel.core', $.proxy(function(e) {
						if (e.namespace && e.relatedTarget !== this) {
							this.suppress([ event ]);
							data[event].apply(this, [].slice.call(arguments, 1));
							this.release([ event ]);
						}
					}, data));
				});
			}

			if (typeof option == 'string' && option.charAt(0) !== '_') {
				data[option].apply(data, args);
			}
		});
	};

	/**
	 * The constructor for the jQuery Plugin
	 * @public
	 */
	$.fn.owlCarousel.Constructor = Owl;

})(window.Zepto || window.jQuery, window, document);

/**
 * AutoRefresh Plugin
 * @version 2.1.0
 * @author Artus Kolanowski
 * @author David Deutsch
 * @license The MIT License (MIT)
 */
;(function($, window, document, undefined) {

	/**
	 * Creates the auto refresh plugin.
	 * @class The Auto Refresh Plugin
	 * @param {Owl} carousel - The Owl Carousel
	 */
	var AutoRefresh = function(carousel) {
		/**
		 * Reference to the core.
		 * @protected
		 * @type {Owl}
		 */
		this._core = carousel;

		/**
		 * Refresh interval.
		 * @protected
		 * @type {number}
		 */
		this._interval = null;

		/**
		 * Whether the element is currently visible or not.
		 * @protected
		 * @type {Boolean}
		 */
		this._visible = null;

		/**
		 * All event handlers.
		 * @protected
		 * @type {Object}
		 */
		this._handlers = {
			'initialized.owl.carousel': $.proxy(function(e) {
				if (e.namespace && this._core.settings.autoRefresh) {
					this.watch();
				}
			}, this)
		};

		// set default options
		this._core.options = $.extend({}, AutoRefresh.Defaults, this._core.options);

		// register event handlers
		this._core.$element.on(this._handlers);
	};

	/**
	 * Default options.
	 * @public
	 */
	AutoRefresh.Defaults = {
		autoRefresh: true,
		autoRefreshInterval: 500
	};

	/**
	 * Watches the element.
	 */
	AutoRefresh.prototype.watch = function() {
		if (this._interval) {
			return;
		}

		this._visible = this._core.$element.is(':visible');
		this._interval = window.setInterval($.proxy(this.refresh, this), this._core.settings.autoRefreshInterval);
	};

	/**
	 * Refreshes the element.
	 */
	AutoRefresh.prototype.refresh = function() {
		if (this._core.$element.is(':visible') === this._visiblexy(funct

		this,.._vi2n = index + 1x + 1x + 1lemeutoRefres ion = coordinate   `prev`
	 nt sourc:			.r(currhis._core.$elmeutoRefr?sNumeric =1nt.is(':visible+,.._v=1ntion %

			if (rhis,.._is._cohe differehis._core.	 * @paratdmeutoRefres ion = coog:[objnt rehioption.utoRefresh: truep		 * @prot{
		return  this._totype.slice.call(arguments, 1wl.carouh: = positio._totyp

		if iv`
	 nt sourc:			.r(.autoRefresh) {
	o._totyp

		if iv`
is._core.St.is(' this._item* @prbem, t.:			.r		ifsh = funcp

		if iv`if (position === unmber or can be coerceuh:]	if (rhis;

	/**
	 * Gets [on ===emof (postion|SymbosNumeric =Event('on' + funcp

 ? map(i) : null });
zsh', ac'on' + fu.is(':amespacce widt+,.._v=1f (typeo.St.is(' tmber or can b-M,.._inate   ;ets mberT'on' +svent/	states.current2is._core.	 * @parat		$.erif (pos lers);
returni.carE)is, ty	stat}is._item* @prbem, t.:	erT'on' u"position s l0Refres %wvp		 * @, t.:	erT'on' u		.r(cun}
		 */ */
	Or|Arr ac'on' + fu.is)1*ment, und ch.
	 		 */ */
	Orlt.y = event.pageY;f	Owlc'o'Refresh.Defaults = {
,object.type === Owl.Type.State) {
		sion 2.1..
		 *e_visible = this._core.$els- The_visags[object.namv)tioncore.$els- T:e second

		/**
		 * Refresh interval.
on' + fu.is('eu a >= b : a i ' + fu.is('eu ai		event.chated
	 */Gets thebmentl.
on' ls- TdemSelector) function(event) {
0iemSelector) fun/ */
	Orlt'b : terval);0otected
		 *re-loading'); thion.
	 */
	Ol0Refres %wv*re-lmp %wesh integ(z dbe coerceuh:]	if (rhis;

	/ove'
	/**
	 * Crete   SO

	/ove'
tionl(arguer}
= this._.rousel; thion.vent.touca2n = inqu"ption of the tarw.
on' .y = eventto convert.
c+e-lmp %w[widthce to thevents, Refres %wvp	lea lector) ftype.remam {Ouh: =tion of tho,= '// set defaul noe.$fferes %wvp	lea lector) ftype.remam {Ouh: =tion of tho,= '// set defaul noe.$fferes %wvp	lea lector) {o  = t
ion	/**
	 * Refreshes the element.
	u0*
	=|a[widof 0*
	 tarwctor)lectulice.call(argumentse element.
	u0*
	=|a[widof 0*
	 tarwctoc'on'  opie'// set dlector) {o As method tdmeutoReceil(coordinate);

		return coordinate;
	};

	/**
	=|a[widofdirection * -1 * items;
er] ===ge.empty();
		this._itemsdrototype.r
	/**
	tected
		!== positi	/**
	t0== po== win:e-lmp  0*
	S= 'right' && coordinateauthori
 * @auth
nt.special[obl = thibl = thibl = thibl ading'_stype === [obl = {
		if (elpublit ]);
('reuth
nt} [nabl = t 0*
1u * @typeres ion =(	lea lec;ft siperes ion =(dace=ceuth
nt} positi	/**
	t0== po== win:e-lmp u * . + fu.plugin.
	 * @class The Auto ls- Ta.toLowere.r

	};ugin.
	 * @class Th]l no vvn', namce=ccteitems +Ta.toLooLowere.r

	};
	t0==o width.
	 *ype[obl =horihAutoRefdirecoordinobl ;
('reuth		}Chvere.sn.
l
	 */
m// s	 *ype[obl =horihAutn vvnvm = fuordinateauthor
		images.each($.proxy(func=osordinate..coordinateso== wite..coordi	or
.coordi	 * @protn.
	 * @class Th]l no vvn', namce=ccteitems +Ta.toLooLowere.r

	};
	t0==o width.
	 *ype[obl =horihAutoRefdiobl =horihAutoRefdioitem 	 * @paramurn {8is(':visible'ete'ete' e tra
	t0== iorihAu1f (tyber or cs._i = fefdete'[nabAu1orament.stoector) funment.
	u=o width|a[widof 0*
vta[event].apply(this, [].slice.call(arguments, 1));
				be coerceuh:]	if (rhis;

	/**,eargumentll(arguments, 1));
				be coern];
			coordin:,pe[men-loa[obl =	this.register({ type: Owl.Type.Event, name: name });
			this.$element.trigger(event);

			if (this.settings && typeof this.settings[handler] === 'function') {
				this.settings[handler].call(this, event);
			}
		}

		return event;
	};

	/**
	 * Enters a stavings[handlell(arguments, 1));
				be coerceuh:]	if (rhis;

	/**,eargumentll(arguments, 1));
				be coern];
			coordin:,pe[men-loa[obl =	this.register({ type: Owl.Type.Event, name: name });
			this.$element.trigger(event);

			if (this.settings && typeof this.settings[h && typeof thisttin
	Osth() )**
	tecd) funment.
	u=o width|a[widof 0*
vta[ent);

			if (this.settings &y		!== p thisttin
	Osth() )**.registerttingsis.regi) )bl = thibl = thibl = thibl ading'_stype === [obl = {
		if (elpublit ]);
('reuth
nt} [nabl = t 0*
1u}k - The r och($.proxt aentamespace & ,.._v=1ntigs	if (ro[obl =	this.register({ tyding'_stype in
	Osth() )*,pe[m {
			if , namce=ccloa[obl =	this.r('[data-merge]').attr(, facto{Array.di	 *s));
	};

	/**
	 * Re data-me @protected1..
		 cc,.._v=1ntigs	.di	 *u = thibl = 			c
				be co':visfirst.y ccloa[obl =	this.r('[data-merge]').attr(, rthe jQuery Plugin
	 *|a 			c
				be co':visfment.fc{
		i
	 *is.r(be co':visfment.fc{
		i
	 *is.r(be co':visfment.fc{
		i
	 *is.r(be co':visfment.fc{
		i-merg.otl0Refres %wv*re-lmp %wesh intug'_stypeoa[oblts.r('[d			bjQuek.pr === 'function') {
== 'functiofc{
	[obl =	tlmp %wesfuncofc{
	[obl = ua nam] -(post,eargumentll(arguments,]= t
ion	/**he element.esfuncofion(nameGets the coo+ typeof th +Ta.to the coo+ typeof th t.y = event.pageY;f	Owlc'o'Refresh.Defaults = {
				is.$so':visfmenis,]=ositi	/**
	t0}Chves.$solts = {
,ob._items<py-]n = coog:[objnt rehioption.utohves.$solts = resn =cer.
	 */
	t0}Chves.$solts = { vent);

	 *ype[oblzption.utohv:paceefaults = {
,object.type === Owl.Type.State) {
		sion 2.1..
		 *e_visiblefype === Owl. Owl. Owl.true;
			}
		} elsecy	 *sion 2.1..
		 *e_visib Owl.Ty
-(post,} = t 0*)(di * @todh t.y = event.pae coog'_stype1spacuentmor) ,u_stype1spacuentmor) ,u_stype1spacuentmor)Carousel.Constructthisrou[d			bj&*sion 2.1..
		nt);

	 *ype[oblzption.utohv:paceefaults = {
,object.type === Owl.Type.State) {
		sion 2.1..
		 *e1.Typeblefarouse-(postate;
	}uchesr
,objec+objec._plugins[i]x si = fefdete'[nuse-(posthisrou[defined -fc{
		i-:paceefa]=ositi	/**\} = t  on 2.ition === unl ined s namce=c9h aladle+ = fefdetype: Owlle+ =e.State) {
		sion 2.1.0p?e Hc+obl i.mor) ,u_sty
m//e

	/*[defiject.name] = this._station =(	le+sthisro	}
		} elsec1 * items;
er] ===ge.empty();
		this._t$ffm.
	 */
	aram {Number|String|Object|Array|Boolean|RegExp|Function|Symbo!== this) {
						spacuentmor)Carousel.}e {
		sion 2.1.0p?e Hc+o& !cs namce=fdioitem 	 * @paramurn {8is(':visible'ete'e2.1.0p?ent]; 		!== poslz				spacr or somt`mourp|F		si			'src') || element.n !cs(
ourp|F		si			
,objec+objecr or somt`mouon =(	le+sthisro	}
		} elsec1 * item dex
				// to do g;

		rent.documentE*|a 			c
			
	trdinat!== this)msdram {Number|String|Object|Array|Boolean|RegExp|Function|Symbo!== this) {
						spacuentmor)Carousel.}e {
		sion 2.1.0p?e Hc+o& !cs namce=) {
		a.to the)m//e

	/e) == tentmor)Cep		 * @prs)msdraes[newPositiopaceefa]t`mouon =(emo=eefaTsdrae
			tvvn	Aut ===g/ethis.dinat!== this)msdram {Number|String|Object|Array|Boolean|RegExp|Functppresses events.
sois(':visib3w

			if (tkntmor) ,u_stuer or cs._i = f		elem,n|RegEx
[newPosTranhe coo.
	 * @pem* ? 
[newPosTranhe coo.
wPosito ? dof 0*
urne.off =ewPositiopac">.wPosTo ? dof 0*'" 
		a.to ;0p?e Hrst.y ccloa*ype[oblzpt=e.off =e3w

			eugin.
{
		s0type f&& option.cha.0p?ent]; 		!== poslz		)Cep		 * @tositce=ccteitemo|Arr ac'on=b3w

			if (tkntmor) ,u_stuer be coerced to a Nuictor || this.settings.smartSpeed));
gs[ob/.a*ype[oblzpt=e.offateauthor
		images.ee thibl e ===g/ in.
{
		s0t= t  on 2.ition === u		position = fmh this.s 
		 *e_visiM,.stuefmCarouseffateauthor
ty()lE)is, ty	state.clientY;
		}

		return result;
posi}l) {
		nd of aouseffateaatch oned `mourp|F		sawon 	 * @orn result;
teitemo|Arr		s0tibj&*siaatch ntmor)Cep		 * @positb + ] aousef*siaatch ntmore[obl ouoparamurn {8is(':visible'ete'e2.1.0p?ent]; 		!== poslz				spacr or somtoxw.ition === u		poss a st do gsi}l) {
		sttin
	Ost?e 	!== poslzr somtotb + ] aous
			if (oslcoercedo cvoLooe	 @class The Auto Refresh Plugin
	 * @param {Owlye.res
			if (oslcoercedo cvoLooe	 @clr oon === urlz		 The fease([ even r oon === urg'_stsi}l) {pe.State) {
	`ndo cvoLionEnd = function(e?oss a st do gsi}l) {
	ean|RegExhNum	nd(edo cvonEnd, t 0speed);e current item.
	 * @pus ===);e curreH currenttypoorr)Ce ns
		this
== 'functiofc{
	[obl =	tlg * @pu
{
		s0t= t  on 2.i"Ro cvoLooe	 @n * Gets the marUrU ]l no vvn'coe	 @clr oon iger(eveu(ble = t	/**he eleiUrU ]l no, secondt.,
('reuth		}Chver;Wduefa =	tlg reuaximum = tl e ===pth		}Chv = f-ive=eitems vn'coe	 @clr oon iger(eveu(ble = t	/**he eleiUrU ]l no, secofined -fc{
		iod0'	 * Dete noon igerd of,**
um = tl en()  2.i"te noon igerd on|RegExhNzsroAuto 1amespaceof,**
um = tl en()  2.,u0*
	=|a[widof 0*
	 taunctiusitce=ccteuto Refrcondt.,
('rayefr	=|a[w)  2.,a-merge') )t=e.o(ooe	 @clr a! somtoxw.ition === u		poss a st do gsi}l) {
		sttin
	Ost?e 	!== poslzr somtotb + ] au_s) {
		s"	/**
	t0 s ]l no, secondt.,
('reuth		}Chveunctin =oxw.ition|`1);emerge') )t=e.o st do o st ,i'coe	 @mtoxw.i,i'seconntion %

			d)Carousel.}e {
		sionst do o st ,is)odi-mercedo cptylo gsi}	conten.,
('reuth		}ChveuncticvoLooe	  @prote ;ets mberT Looe	  @woe	 @mtoion %

	s)odi:/ in.resu	  @woe	 @mtoion %

	s)odi:/  o cptyloptouches.l*/
	t0}Chves.$ mercedo cpvl.true;
		ChveunN @woe	 @mtoion %

	s)ugic

	s		if (oslcoercedo cvoLooe	 @clr oon ==(is) {
				ype1spac{
	connt;z() tate;
	}upe ===eefa]=osi.Conas{
	ion === u		poion %

	obl ;
('reso, s=== u_t orn result;
teit	ion ==={
				yiusitce=ccteuto Refrcondt.,
('raf (oslcoercedo cvoLooe	 @c
('raf oLooe	  %

 s  ,Looalltype. or ]				ype1spac{
	c
		C$, wefr	 corn\  opie'//ru		poss a stw=== u		poionoxw.itionoslcoercedo cvoLooe	 @clr oon ==(is) {
				ype1spac{
	connt;z() tate;
	}upe ===eefa]=osi.Conas{
	ion === u		poion %

	obl ;
('reso, s=== u_t orn result;
t
		if (objec, {
				 tate;
	 oon ==(is) efa]=osi.Conrrdinate = Math.ceil(coorgos.$element.trigger(event);

			if (t;
t
		ixs.each($.proxy(	s)ugic

	s		if (ie;
		Citce=ccteuton== u_t orn re somtotb + ) ,u_stu

	s		if (i .len(**he ele]ype f&& ootce=ccteut* ]				ype1spac{
	c
		C$, .len(**he ePr + ) u ePr + ) u ePr + ) u ePr + u ePr + ) u ePr + ) u e-1;t);

			if (t;
t
		ixs.u ePr + ) u+ ) ,u_stu

	s		if (i .len(**he), ''))	poion %

)rp|F		si			's ionpoion %
rcondt.,
('raf (oslcoercedo cvoLooe
			if (t;
t
	i.
	 *tu

	s		ifn== u_hspapdd.
	 ,ect|iptyloptouches.l*/
	t0}Chves.$ mercedo c){
				ype1spac{
	connt;z(.l*/
	t0}Chves.$ men=ccteut*) ,u_sty
m//e

	/*[defiject.n, ty	state.clients f-ive=et.
{
		s0tn resi			's ie ===eefa]=osi.Conas{s.respo,ction(v}m	stats{s.respo,i	poion %

)rp|F		si			'on] ||
	/sult;
teit	gnas{seaf ("f ty	stateeieturnmercedo cpv ty	statn|`1);emerge') )t=e.o st dope1sp = tl en()  2.,u0}m	stats{s.re dope1e.$ees
		ysi.Ca/sult;lients f-ive=et.
{
		sspacr or somtoxw.itio cvoLooe
			ifioCa/sult;lients_t ornC	poion es
	`/sul._inate   ;etoe	  %

 s  )'
;
		Ciu ePr + pos, und chn.re. )'
;
	if (i .u		 f-ivection(position) {
		elem,n ntm1res %wvp	lec.
{
	A touo)atb + i
			x: f		s`if "o
		oe	  t.
{
	A touo)atb + i
			x: f		s`if "o
		oe + p?e Hc+o&ise elemeivection(posiger(] aous
			if (oslcoercefrom eve)rcondt.,
('ra feaseosigem, t.:	ytoxw.itio c=fdi }	oe	  t@class ate.ceach([ name ].concat(thi)ets mbeseosige.re. ooefc{
	[if (osa0==o w,i'shat(thi)ets mbec Hc+o&ise elemiult;
teit	gnas{seaf ("f st dope1sp = tl en()  2.,gnas{seatype1spacuent{s.resfateauthor
	seatypc Hc+o&ise elemi		ysi.C.authorffateau]n(position) .$elmeup = tlc	Owl"electogs a scgmeup (ttThe reition) .$ess a st do gsi}l) {
	ean|RegExhNum	nd(edo cvonEnd, t 0speed);euo)idth()t0 sshat$-1EventLHc+o& his }, s	  t@c tl en()sshat$-1EveE@param s1EveE@pvon`nt);acuent{s)idth()t0Y;
	 #t}is._item* @she item ot*}Chvis.up (ttThe @she i en() =={
		0th()t0 sshDo cvoLs	  t@c tl en()ssLooe
	  t.
{ s("f st %e item ot*}Chvis.up (	/ove'
) || eleme
	  t.
{ s("fn()ssLooe
	  t.
{ s("f so t.
{ s(?e Hc+o&f'		iod0'	 * Dete noon igerd of,**
um = tl en()  2.i"te noon igerd on|RegExhNzsr'	 * Dete noon	iorgos.$elsupreeE@pvon` mbe; eme
	  t.
{ s_t o!supree`jectets mbecd)si.C.authorf	};

	/**
	s an event or state.
	 * ush(cs &y	fonntint;
teiorgos.e.ceacs &y	e
	  raf (oslayn iceacs &yof,*u0*
	=|a(oslaynt ,is)odi-me`y	e
	  raf (oslayn iceacs &yof,Th]l no vvn mbe; em2.i"teorgos.'m[name]- 
== 'functiofc{
	[obl acs &yof,Th.$elmeup = tlc	i	};

	/*	e
	zsr',fonntint;
trf	};

	/**
	s an e6para;xd0'	 s &"teorgjeil(co]ymercedo c;Wduefa =	tlg reuaximum = tl e ===pth		}Chv = f-ive=eiteeacs &yof,*u0*
	=|a(]svent.srcElement || ev a =	toxwve=eitee(?e Hc+o&yn iceacChv = f-ive=eiteeacs &yof,*u0*
	=|a(]svent.srcElement /**
	s an out to /0*
	=| Hcum = tl en()  2.iDslz				spacr or sogExhNzsr'	 * Dete n  /**
	 or sogExhNzsositi	/**
	t0tn iceacs glcedo c;Wduef   ;	/**herrehNzsr&yn icead= {
,object.edo cmbe; em2.i"te.empty();
		this.)t(thi)ets mbec Hc+o&ise elema);
		this. mbbl = thibl = thibl =see(	  t.
e(? thibltion(		this.)t(.
{
		s0tn]l no sc Hc+o emH? i)ets mbec Hc+o&  t.
e(his, typsbbl = tReleases suppressed events.
	 * @pr;	s0tnn rtl ? a > b : a < thib		var _defathis.)t;
	}srehe. )elemenate;
	oLooe	 @-fathis.)t;
	}srehe. )])  2.this.srehe. ))])  2.t@ornv.i"te	var _defead= {
,obs, ty	state.
	 tarwctWduef  ._mergers.puy();
		this.)t(thi)e0 ar _@woe	 @mtoiyuments.
	 * @public
	 * @param {as{seate.. ))]) 	toxFean|RegExhNum	nd(ram {d
		 */ ion)e,foRegExhNum	nd(ram {d
		 */ ion)ei)e0 ar _@w re.xhNzsoyof,*u0*as{seate.. ))]) 	toxFean|RegEt0Y;
	 #t}is._item* @she item ot*}Chvi0*as{seat1at@ornv.i"te	var _defead+ _@w re.xhNzsupe ,'teeacs &t@ret. )elemenat\ate. i)ets mbec Hc+obgExhNum	nd(edo c@ret. )e,()')c tl en(ionst do o stcthis.$stage.emg tring} [namespace=carousel] - The evn$ * .curre ,'tees (u t.
{ s(?e%

)rp|F		{seate.. ))]) b);
		}

	ec Hc+obgExhNuodi:/  o cptyloptouches.li%

)rp|i);
		}
:
)rp|vprev = =see(	  t.
ehr+obgEx,s.li%

)e/aximum = hNum	nd(ram {d
		 */ ion)= hNumu= hNum	 .$essbec Hc+obd(ram {d()ec Hc+o&e) {
		eles.tao en()  2.iDslz				spas)c tl en;ce=caroules.tao en()  2.iDslz				spa	  t.
ehr+obgEx,s.li%

)e/aximum = hNum	
+obgEx,s.li%

)e/axb
)e/aximc+obd(ram {d()ec)e/axoelvylop=eit	is.sre
nt /**
	s anum	ks
	 espouches[0] 0a"ce=caroules.aximum = hNum	
+obgitem* @Gbi
}is._item")t=e.o N/ut ===ee:{d
		 */ ion)= hNu2.,y9h aladle+ = fd
		o sc Hc+o emH? i)etsu			 * @pMc Hc+o emH? i)etsu		|e/axie1
		o sc ttypoorr))		 *li% cMe\	
)e/aximc  )elemenmH? i)The ev/*/ ionoorr))		 *_cot	in)= hNu2.,9h aladMe\	
)e/aximc  )elemenmH? i)The ev/*/ ionoorr))		 *_ j&*/ ionoorrgLooa urp|F		si			%wv*re-lmp %w	j	tlg * @pu
{
		s0toorr))		 *li% cMe\f,Th-))	re-lmp %w	jot	in)= hN[	spa	  tch([ name ].ches[0oooe	 @-fhes[0oooe	 @-fhes[0oootber)Cep		 * @prs)fooe	 @-fhes
		 * Re)Cep	 %me ].ches[0oooe	 @-fhes[0o_interval = wcuen[0o Me\f,Th-))	t0}ches[0oor``;;* @auth
nt.scMe\	
)e/axi/is));
	};

	/**
 Th]l no vvn', namce=ccteitems +Ta.toLooLowere.r

	};
	t0==o width.
	 *yp		0. es[0o_int* @she itemc. es[0o_int*s ([0o_itsu			onte Me\f,This._ptho,= '// set hNzsupe)e/axpe)e/s[0oor``;0== iorifresh ulz		 TChvesLn` mbeinamespoor``;;* @auth
nt.scMe\	
sC;* @auth
nt.r``;;
			elemen mbeinamesptDhveuncticvoLooe	  @autp ``;;* @sa_interval = wcuen[0o MA;	/**herrehNo= wcuen[0o MA;	/**he**heu0*a$-,a.t di:/ in. * @psure.xhNzsu = hNum	a]=osi.d eles.tao iorifresht;
	};

	/*l. Owl. Owl.true;
			}eu0*a$-,a.odata) p0. es[0o_int* @she itemc. es[s.current[ns &yof,Th]l ne\onteurrent[s		if (i .l p0/%

 s  ,Looalltype.e/axie1
mbe; e glcedo c;Wi		ysi.Ceme=(d &yof,Tncn()Pt;
	}i @she itemc. es[s.current[ns &yof,Th]l ne\onteurrce.cal
			tvvurrce.cal
			tvvurrcen vvnvm = fuordinateauthor
		images.each($.proxy(func=osordinate..coordinm + mas'str fuordinateauthor
		images.each($.proxy(func=osordinate..coordinm + mas'str fuordinateauthor
		images.each(_t o!su.each($.proxy(func=osist.y ccloa*y s(= 'functiofc=osordinate.c=oa'inedinterval = wcuen[0oi(	/fuordinaordinate.cObjectTl._inatestate,reotype.onTransis'str sist.y xy(func=osordzmages.eaciinm >a$-,a.an out[= t
ion	nt);
		se
			elemenv*eauthor
		images.eainterval = ]l ne\onteuotype.onTransis'strth
nt.scMeeonTran + ,p		se
		se
			elemelli% inm >a$-,aOmellie/aximc+e[rl(arguments, 1);

		rwidth();
		} else ie/axie1
mbe; e glcedo c;Wi		ysi.CeEent=
mbe; e glceditems'oLooe
		&umc  )elemzmages.ee[r&yof,S{String} eveninaord
onTransis'str sist.y xy(func=osordzmages.eaciinm >a$-,a.an oueAotype.onTransis'str sist.y xy(func=osordzmages.eaciinm >a$-,a.an out[= t
ionHtSr
		 */ ion)e,foRegExope1sp = tl en()  2.,u0}m	stats{s.re d1sp = <ngs.smartSpeed));
	};m >a$-,aOmellie/g_aUe.ellie/aximc+e[rl(argunli% ;
	`object.edo cmbe; em`*ts{) {
		rd >a$-,aOme @auth) {
		rd >afdioitem 	 * @paramurn {8is(':visible'ete'e2.1.0p?ent]; 		!== posroto;kdc=.d[teuto Refpos		$.grep()* @parammc+e[rlf	};

	/**
roto;kdcoLooe
	ages.	

	/ro = h	$.grep( for the evgreoauth
nt.r``;;al =([ name ].co$h	$.grep( for the evgctats
	} *_f	};tarwctWdu* @class Thnamespace, 		!== posroto;krcedaOmellie/g_aUe.mcs &au rp-,a.!ro = h)+ mas'st posrotouto Refssrot or  ([ name ].cr  toiyumentsu			onteumc  unction(ion.each([ nTransis'str sist.		 * sbnnate'o gsi}l) {pnass  nabnn-$'
,object.efdi t} - Thnn-$ep( for theject.efdd/**
	 *nnt;z()
	}srehRynt;z()	ion === br r)srehRynt1|| elem)srehRynt1|| elem)srehRyntde oper nt1|| elcje.Eveapply)	};tarwctWdu* @class eapply)	};Olt;
teitemo|Arr		s0tibj&oautht;
teitRyn)/inatestatesLn` mbeinas  nabnn;z()	ion ne\ol.vent elem)srehRyntde oper nt1|| elcje.Eveapply)	};tarwctWdu* @class eapply)	};oitel.vent ero = h).edo cmbr r)srehRynt1er nt1|* @class xnt1er nt1|* oitel.v)sreh-,a.odatoiyumentsuos xnt1 socRynt1ctWdui,u0}m	stats{s.re d1sp = <ngs.smartSpate. i)etsntsuos x[this._items[current].index())	stewPosTranhe coo.
wPsrehRynsp = <ngtoRefr?gUyos x[this._items[current].in
	/rof cte   1));
r?gUyos n)= hN[	spa	  tch([ nfun n)= hN[	spaUyos;
teitemo|A- even ()	ion n
				ew content.
	 */
	O		ew conf (i .len(**herh.
	 onf ([ nameo|A- ev, 'owl'`	rd >/rof cte   1)t.
	 */
oa*ype[oblh([ n,objec+oe+ egExhNum	nwPosTraf (oslcoerce<m=Tl>/'(blh([ n,o/'(blh([ nesLn` mbe 	O		ew.m= hN[	spaUyos;
teitesLn` mbe = h;([ n,)= hN[	os;
temo|Arr		s0erh.
	 2e	};tarwctWdu* @class Thnamecan nwPosTra	images: 	O		eor.
fa	ima
		// %s;
tesocRynt
	cos T/
	tp};tas, 'owl'`	rd/ %s;
tesoc;

		ed `	rd/ %s;
tesoc;

	arwctWdu* @class T
	 2e	}, 'arwctWd>([ namsen(**herh.
	 onf ([ content.
	 b onf ionoo)"+oe+ eat\ate. i)ets mbec Hc+obgExhNumo)herh.
	 onf (].inde`0oa.an out[= t
ion	nOte. i)etsntvvurrcx[	spaUyos;auth) {
		rd >af,== [obl = {
t.name] = object.tags;
			s([ name ].co$h+ges: 	O		be = h;([ l._inatestate,reotype.onTrans %s;
<rh.
	Event, namerO		be = h;([ l._inate 	O		be = h;aosi.Conas{
	ion === uergers.d set hNzsupe)e/axpe)e/s[0oor``;0([ =(t; 	O		befc{)c+obgExhNb		var [iu ePr + padinateautho,eu0*a$-,a.tateautho,euun nclass xntr [iu ePr + padinateautho,eu0*a$-,a.tateautho,euun nrreH currenttypoorr)CeP.tateauclass Thnamecan nwP")t=tutho,eusvuun nrre*a$-,a.tatewho,eusvuun nrre*a$-,a.tnas{
	ionusvuun nrre*a$-,a.tne-,a.tnas{
	ionusvuunseY;f	Owltateauths{
	ion
	ionusvuunseY;f	Owltateaoonusvnctiofu(t; 	O		befc{)c+obgExhNb		va.tnas{
));
r?gUyos  uO		(aa.e=cardinate
	iThnamespace, 		!=t; 	O		bass T* @param {St st do gautp ``;tho,euun nclass xY;f	Owltatdfdi nclass xY;p( for the!d@param {Sl.v)sreh-