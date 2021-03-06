// ==UserScript==
// @name           Tiberium Alliances ReplayShare
// @version        0.3.1
// @namespace      http://openuserjs.org/users/petui
// @license        GPL version 3 or any later version; http://www.gnu.org/copyleft/gpl.html
// @author         petui
// @description    Share combat reports with your friends in other alliances and worlds
// @include        http*://prodgame*.alliances.commandandconquer.com/*/index.aspx*
// @grant          none
// ==/UserScript==
'use strict';

(function() {
	var main = function() {
		'use strict';

		function createReplayShare() {
			console.log('ReplayShare loaded');

			Parse.initialize('PmNW9dH7wrTFQmYgInbDVgGqagUOVPIzENRwzfWu', 'ajepOC4n9K44jh89s5WKtEa4v0hh3OMokxNqLqt0');
			var Replay = Parse.Object.extend('Replay', {
				/**
				 * @returns {Object}
				 */
				getData: function() {
					return this.get('data');
				},
				/**
				 * @param {Object} data
				 * @returns {Replay}
				 */
				setData: function(data) {
					this.set('data', data);
					return this;
				},
				/**
				 * @param {Object} data
				 * @returns {Boolean}
				 */
				equals: function(data) {
					return JSON.stringify(this.getData()) === JSON.stringify(data);
				}
			});

			qx.Class.define('ReplayShare', {
				type: 'singleton',
				extend: qx.core.Object,
				events: {
					lastReplayDataChange: 'qx.event.type.Data'
				},
				members: {
					lastReplayData: null,
					window: null,

					initialize: function() {
						this.initializeHacks();
						this.initializeEntryPoints();
					},

					initializeHacks: function() {
						var source = ClientLib.Vis.Battleground.Battleground.prototype.LoadCombatDirect.toString();
						var initCombatMethodName = source.match(/this\.([A-Z]{6})\(null,[a-z]\);}$/)[1];

						var context = this;
						var originalInitCombat = ClientLib.Vis.Battleground.Battleground.prototype[initCombatMethodName];

						ClientLib.Vis.Battleground.Battleground.prototype[initCombatMethodName] = function(extra, data) {
							originalInitCombat.call(this, extra, data);
							context.lastReplayData = data;
							context.fireDataEvent('lastReplayDataChange', data);
						};

						var originalOpenLink = webfrontend.gui.Util.openLink;
						webfrontend.gui.Util.openLink = function(url) {
							if (!context.handleLink(url)) {
								originalOpenLink.apply(this, arguments);
							}
						};
					},

					initializeEntryPoints: function() {
						var subMenu = new qx.ui.menu.Menu();
						var button = new qx.ui.menu.Button('Open');
						button.addListener('execute', this.openWindow, this);
						subMenu.add(button);
						qx.core.Init.getApplication().getMenuBar().getScriptsButton().Add('ReplayShare', 'FactionUI/icons/icn_replay_speedup.png', subMenu);

						var shareButton = new qx.ui.form.Button('Share').set({
							appearance: 'button-text-small',
							toolTipText: 'Open in ReplayShare',
							width: 80
						});
						shareButton.addListener('execute', this.onClickShare, this);
						qx.core.Init.getApplication().getReportReplayOverlay().add(shareButton, {
							right: 150,
							top: 12
						});
					},

					/**
					 * @param {String} key
					 * @returns {Object}
					 */
					getConfig: function(key) {
						var config = JSON.parse(localStorage.getItem('ReplayShare')) || {};
						return key in config ? config[key] : null;
					},

					/**
					 * @param {String} key
					 * @param {Object} value
					 */
					setConfig: function(key, value) {
						var config = JSON.parse(localStorage.getItem('ReplayShare')) || {};
						config[key] = value;
						localStorage.setItem('ReplayShare', JSON.stringify(config));
					},

					/**
					 * @param {String} url
					 * @returns {Boolean}
					 */
					handleLink: function(url) {
						var matches = url.match(/^https?:\/\/replayshare\.parseapp\.com\/([A-Za-z0-9]+)/);

						if (matches !== null) {
							var id = matches[1];

							if (this.getConfig('dontAsk')) {
								this.openWindow();
								this.window.download(id);
							}
							else {
								var context = this;
								var widget = new ReplayShare.ConfirmationWidget(url, function(dontAskAgain) {
									context.openWindow();
									context.window.download(id);

									if (dontAskAgain) {
										context.setConfig('dontAsk', true);
									}
								});
								widget.open();
							}

							return true;
						}

						return false;
					},

					openWindow: function() {
						if (this.window === null) {
							this.window = new ReplayShare.Window(this);
						}

						this.window.open();
					},

					onClickShare: function() {
						this.openWindow();
						this.window.onClickFetchReplayData();
					},

					/**
					 * @param {Object} replayData
					 * @returns {Boolean}
					 */
					tryPlay: function(replayData) {
						qx.core.Init.getApplication().getPlayArea().setView(ClientLib.Data.PlayerAreaViewMode.pavmCombatReplay, -1, 0, 0);

						try {
							ClientLib.Vis.VisMain.GetInstance().get_Battleground().LoadCombatDirect(replayData);
						}
						catch (e) {
							console.log('ReplayShare::tryPlay', e.toString());
							return false;
						}

						return true;
					},

					/**
					 * @returns {Boolean}
					 */
					hasLastReplayData: function() {
						return this.lastReplayData !== null;
					},

					/**
					 * @returns {Object}
					 */
					getLastReplayData: function() {
						return this.lastReplayData;
					}
				}
			});

			qx.Class.define('ReplayShare.Window', {
				extend: qx.ui.window.Window,
				construct: function(replayShare) {
					qx.ui.window.Window.call(this);
					this.replayShare = replayShare;

					this.set({
						caption: 'ReplayShare',
						icon: 'FactionUI/icons/icn_replay_speedup.png',
						contentPaddingTop: 0,
						contentPaddingBottom: 2,
						contentPaddingRight: 6,
						contentPaddingLeft: 6,
						showMaximize: false,
						showMinimize: false,
						allowMaximize: false,
						allowMinimize: false,
						resizable: true
					});
					this.getChildControl('icon').set({
						scale: true,
						width: 20,
						height: 12,
						alignY: 'middle'
					});

					this.initializePosition();
					this.addListener('move', this.onWindowMove, this);
					this.setLayout(new qx.ui.layout.VBox());

					this.add(this.errorMessageLabel = new qx.ui.basic.Label().set({
						font: 'font_size_13',
						textColor: '#e44',
						visibility: 'excluded'
					}));

					var createPlayerGroupBox = function(legend, factionImage, nameLabel, baseLabel, allianceLabel) {
						var nameContainer = new qx.ui.container.Composite(new qx.ui.layout.HBox(4));
						nameContainer.add(factionImage.set({
							width: 18,
							height: 18,
							scale: true
						}));
						nameContainer.add(nameLabel);

						var groupBox = new qx.ui.groupbox.GroupBox(legend);
						groupBox.setLayout(new qx.ui.layout.Grid(2, 2)
							.setColumnFlex(0, 1)
							.setColumnFlex(1, 9)
						);
						groupBox.add(new qx.ui.basic.Label('Name:').set({ font: 'font_size_13_bold' }), { row: 0, column: 0 });
						groupBox.add(nameContainer, { row: 0, column: 1 });
						groupBox.add(new qx.ui.basic.Label('Base:').set({ font: 'font_size_13_bold' }), { row: 1, column: 0 });
						groupBox.add(baseLabel, { row: 1, column: 1 });
						groupBox.add(new qx.ui.basic.Label('Alliance:').set({ font: 'font_size_13_bold' }), { row: 2, column: 0 });
						groupBox.add(allianceLabel, { row: 2, column: 1 });

						return groupBox;
					};

					var detailsContainer = new qx.ui.container.Composite(new qx.ui.layout.Flow()).set({
						font: 'font_size_13',
						textColor: '#111'
					});
					this.add(detailsContainer);
					detailsContainer.add(createPlayerGroupBox('Attacker',
						this.attackerFactionImage = new qx.ui.basic.Image(),
						this.attackerNameLabel = new qx.ui.basic.Label(),
						this.attackerBaseLabel = new qx.ui.basic.Label(),
						this.attackerAllianceLabel = new qx.ui.basic.Label()
					).set({ width: 290 }));
					detailsContainer.add(createPlayerGroupBox('Defender',
						this.defenderFactionImage = new qx.ui.basic.Image(),
						this.defenderNameLabel = new qx.ui.basic.Label(),
						this.defenderBaseLabel = new qx.ui.basic.Label(),
						this.defenderAllianceLabel = new qx.ui.basic.Label()
					).set({ width: 290 }));

					this.add(this.timeOfAttackLabel = new qx.ui.basic.Label().set({
						alignX: 'right',
						textColor: '#aaa'
					}));

					var controlsContainer = new qx.ui.container.Composite(new qx.ui.layout.HBox(4)).set({
						marginBottom: 4,
						marginLeft: 2,
						marginTop: 4
					});
					this.add(controlsContainer);

					this.fetchReplayDataButton = new qx.ui.form.Button('Fetch').set({
						enabled: this.replayShare.hasLastReplayData(),
						toolTipText: 'Fetch most recently viewed replay or simulation'
					});
					this.fetchReplayDataButton.addListener('execute', this.onClickFetchReplayData, this);
					controlsContainer.add(this.fetchReplayDataButton, { flex: 1 });

					if (!this.replayShare.hasLastReplayData()) {
						this.replayShare.addListenerOnce('lastReplayDataChange', this.onLastReplayDataChanged, this);
					}

					this.watchReplayButton = new qx.ui.form.Button('Play').set({
						enabled: false,
						toolTipText: 'Watch loaded replay'
					});
					this.watchReplayButton.addListener('execute', this.onClickWatchReplay, this);
					controlsContainer.add(this.watchReplayButton, { flex: 1 });

					this.uploadButton = new qx.ui.form.Button('Get link').set({
						enabled: false,
						toolTipText: 'Get share link for loaded replay'
					});
					this.uploadButton.addListener('execute', this.onClickUpload, this);
					controlsContainer.add(this.uploadButton, { flex: 1 });
				},
				statics: {
					DefaultWidth: 300,
					DefaultHeight: null
				},
				members: {
					replayShare: null,
					sharePopup: null,
					errorMessageLabel: null,
					attackerFactionImage: null,
					attackerNameLabel: null,
					attackerBaseLabel: null,
					attackerAllianceLabel: null,
					defenderFactionImage: null,
					defenderNameLabel: null,
					defenderBaseLabel: null,
					defenderAllianceLabel: null,
					timeOfAttackLabel: null,
					fetchReplayDataButton: null,
					watchReplayButton: null,
					uploadButton: null,
					replay: null,

					initializePosition: function() {
						var bounds = this.replayShare.getConfig('bounds');

						if (bounds === null) {
							var baseNavBarX = qx.core.Init.getApplication().getBaseNavigationBar().getLayoutParent().getBounds().left;

							bounds = {
								left: baseNavBarX - ReplayShare.Window.DefaultWidth - 16,
								top: 75,
								width: ReplayShare.Window.DefaultWidth,
								height: ReplayShare.Window.DefaultHeight
							};
						}

						this.moveTo(bounds.left, bounds.top);
						this.setWidth(bounds.width);
						this.setHeight(bounds.height);
					},

					/**
					 * @param {qx.event.type.Data} event
					 */
					onWindowMove: function(event) {
						this.replayShare.setConfig('bounds', event.getData());
					},

					onLastReplayDataChanged: function() {
						this.fetchReplayDataButton.setEnabled(true);
					},

					onClickFetchReplayData: function() {
						var replayData = this.replayShare.getLastReplayData();
						replayData = JSON.parse(JSON.stringify(replayData));	// clone
						delete replayData.debug;

						if (this.replay === null || !this.replay.equals(replayData)) {
							this.setReplay(new Replay().setData(replayData));
						}
					},

					onClickWatchReplay: function() {
						var replayData = this.replay.getData();

						if (!this.replayShare.tryPlay(replayData)) {
							this.errorMessageLabel.setValue('Error: Invalid replay data');
							this.errorMessageLabel.show();
						}
						else {
							this.errorMessageLabel.exclude();
						}
					},

					onClickUpload: function() {
						this.openSharePopup();

						if (this.replay.isNew()) {
							var context = this;

							this.replay.save(null, {
								success: function(replay) {
									context.sharePopup.setLinkURL('https://replayshare.parseapp.com/' + replay.id);
								},
								error: function(replay, error) {
									context.sharePopup.setError(error.message);
								}
							});
						}
						else {
							this.sharePopup.setLinkURL('https://replayshare.parseapp.com/' + this.replay.id);
						}
					},

					/**
					 * @param {Object} replayData
					 */
					setDetailsFromReplayData: function(replayData) {
						var isForgottenAttacker = replayData.af !== ClientLib.Base.EFactionType.GDIFaction && replayData.af !== ClientLib.Base.EFactionType.NODFaction;
						this.attackerFactionImage.setSource(phe.cnc.gui.util.Images.getFactionIcon(replayData.af));
						this.attackerNameLabel.setValue(isForgottenAttacker ? this.tr('tnf:mutants') : replayData.apn);
						this.attackerBaseLabel.setValue(this.getReplayAttackerBaseName(replayData));
						this.attackerAllianceLabel.setValue(isForgottenAttacker ? this.tr('tnf:mutants') : (replayData.aan || '-'));

						var isForgottenDefender = replayData.df !== ClientLib.Base.EFactionType.GDIFaction && replayData.df !== ClientLib.Base.EFactionType.NODFaction;
						this.defenderFactionImage.setSource(phe.cnc.gui.util.Images.getFactionIcon(isForgottenDefender ? ClientLib.Base.EFactionType.FORFaction : replayData.df));
						this.defenderNameLabel.setValue(isForgottenDefender ? this.tr('tnf:mutants') : replayData.dpn);
						this.defenderBaseLabel.setValue(this.getReplayDefenderBaseName(replayData));
						this.defenderAllianceLabel.setValue(isForgottenDefender ? this.tr('tnf:mutants') : (replayData.dan || '-'));

						this.timeOfAttackLabel.setValue(phe.cnc.Util.getDateTimeString(new Date(replayData.toa)));
					},

					/**
					 * @param {Object} replayData
					 * @returns {String}
					 */
					getReplayAttackerBaseName: function(replayData) {
						var attackerBaseName;

						switch (replayData.af) {
							case ClientLib.Base.EFactionType.FORFaction:
							case ClientLib.Base.EFactionType.NPCBase:
							case ClientLib.Base.EFactionType.NPCCamp:
							case ClientLib.Base.EFactionType.NPCOutpost:
								attackerBaseName = this.tr(replayData.an) + ' (' + replayData.abl + ')';
								break;
							default:
								attackerBaseName = replayData.an;
						}

						return attackerBaseName;
					},

					/**
					 * @param {Object} replayData
					 * @returns {String}
					 */
					getReplayDefenderBaseName: function(replayData) {
						var defenderBaseName;

						switch (replayData.df) {
							case ClientLib.Base.EFactionType.FORFaction:
							case ClientLib.Base.EFactionType.NPCBase:
							case ClientLib.Base.EFactionType.NPCCamp:
							case ClientLib.Base.EFactionType.NPCOutpost:
							case ClientLib.Base.EFactionType.NPCFortress:
								var defenderPlayerId = replayData.dpi;
								var type;

								switch (Math.abs(defenderPlayerId) % 10) {
									case ClientLib.Data.WorldSector.WorldObjectNPCCamp.ECampType.Beginner:
									case ClientLib.Data.WorldSector.WorldObjectNPCCamp.ECampType.Random:
										type = 'tnf:mutants camp';
										break;
									case ClientLib.Data.WorldSector.WorldObjectNPCCamp.ECampType.Cluster:
										type = 'tnf:mutants outpost';
										break;
									case ClientLib.Data.WorldSector.WorldObjectNPCCamp.ECampType.Fortress:
										type = 'tnf:centerhub short';
										break;
									default:
										type = 'tnf:mutants base';
								}

								defenderBaseName = this.tr(type) + ' (' + Math.floor(Math.abs(defenderPlayerId) / 10) + ')';
								break;
							default:
								defenderBaseName = replayData.dn;
						}

						return defenderBaseName;
					},

					/**
					 * @param {String} id
					 */
					download: function(id) {
						this.errorMessageLabel.exclude();
						this.resetFields('Loading...');

						var context = this;
						var query = new Parse.Query(Replay);
						query.get(id, {
							success: function(replay) {
								context.setReplay(replay);
							},
							error: function(replay, error) {
								context.errorMessageLabel.setValue('Error: ' + error.message);
								context.errorMessageLabel.show();

								if (context.replay !== null) {
									context.setDetailsFromReplayData(context.replay.getData());
								}
								else {
									context.resetFields(null);
								}
							}
						});
					},

					/**
					 * @param {Replay} replay
					 */
					setReplay: function(replay) {
						this.replay = replay;
						this.setDetailsFromReplayData(replay.getData());
						this.watchReplayButton.setEnabled(true);
						this.uploadButton.setEnabled(true);
					},

					openSharePopup: function() {
						if (this.sharePopup === null) {
							var bounds = this.getBounds();
							this.sharePopup = new ReplayShare.Window.ShareLink();
							this.sharePopup.moveTo(
								bounds.left - (this.sharePopup.getWidth() - bounds.width) / 2,
								bounds.top - (this.sharePopup.getHeight() - bounds.height) / 2
							);
						}

						this.sharePopup.open();
					},

					/**
					 * @param {String} label
					 */
					resetFields: function(label) {
						this.attackerFactionImage.setSource(null);
						this.attackerNameLabel.setValue(label);
						this.attackerBaseLabel.setValue(label);
						this.attackerAllianceLabel.setValue(label);
						this.defenderFactionImage.setSource(null);
						this.defenderNameLabel.setValue(label);
						this.defenderBaseLabel.setValue(label);
						this.defenderAllianceLabel.setValue(label);
						this.timeOfAttackLabel.setValue(label);
					}
				}
			});

			qx.Class.define('ReplayShare.Window.ShareLink', {
				extend: qx.ui.window.Window,
				construct: function() {
					qx.ui.window.Window.call(this);

					this.set({
						caption: 'Share link',
						allowMaximize: false,
						allowMinimize: false,
						showMinimize: false,
						showMaximize: false,
						showClose: true,
						resizable: false,
						padding: 1,
						textColor: '#aaa',
						width: 378,
						height: 98
					});
					this.setLayout(new qx.ui.layout.VBox());

					this.add(new qx.ui.basic.Label('Copy the link to share this replay with others'));
					this.add(this.linkField = new qx.ui.form.TextField().set({
						readOnly: true,
						focusable: true,
						placeholder: 'Loading...'
					}));
					this.add(this.errorMessageLabel = new qx.ui.basic.Label().set({
						textColor: '#e44',
						visibility: 'excluded'
					}));

					this.linkField.addListener('click', this.linkField.selectAllText, this.linkField);
					this.addListener('changeActive', this.onChangeActive, this);
				},
				members: {
					linkField: null,
					errorMessageLabel: null,

					/**
					 * @param {qx.event.type.Data} event
					 */
					onChangeActive: function(event) {
						if (!event.getData()) {
							this.close();
						}
					},

					open: function() {
						this.linkField.setValue(null);
						this.errorMessageLabel.exclude();
						qx.ui.window.Window.prototype.open.call(this);
					},

					/**
					 * @param {String} url
					 */
					setLinkURL: function(url) {
						this.linkField.setValue('[url]' + url + '[/url]');

						new qx.util.DeferredCall(function() {
							this.linkField.focus();
							this.linkField.selectAllText();
						}, this).schedule();
					},

					/**
					 * @param {String} error
					 */
					setError: function(error) {
						this.errorMessageLabel.setValue(error);
						this.errorMessageLabel.show();
					}
				}
			});

			qx.Class.define('ReplayShare.ConfirmationWidget', {
				extend: webfrontend.gui.CustomWindow,
				construct: function(url, callback) {
					webfrontend.gui.CustomWindow.call(this);
					this.callback = callback;
					this.url = url;

					this.set({
						caption: 'Open link',
						allowMaximize: false,
						allowMinimize: false,
						showMaximize: false,
						showMinimize: false,
						showClose: false,
						resizable: false,
						modal: true
					});
					this.setLayout(new qx.ui.layout.VBox(10));
					this.addListenerOnce('resize', this.center, this);

					this.add(new qx.ui.basic.Label('Would you like to open this link with ReplayShare?').set({
						rich: true,
						maxWidth: 360,
						wrap: true,
						textColor: 'white'
					}));

					var buttonContainer = new qx.ui.container.Composite(new qx.ui.layout.HBox(10).set({
						alignX: 'right'
					}));

					var yesDontAskButton = new webfrontend.ui.SoundButton('Yes and don\'t ask again');
					yesDontAskButton.addListener('execute', this.openReplayShareAndDontAsk, this);

					var yesButton = new webfrontend.ui.SoundButton('Yes');
					yesButton.addListener('execute', this.openReplayShare, this);

					var noButton = new webfrontend.ui.SoundButton('No');
					noButton.addListener('execute', this.openExternal, this);

					var cancelButton = new webfrontend.ui.SoundButton('Cancel');
					cancelButton.addListener('execute', this.close, this);

					buttonContainer.add(yesDontAskButton);
					buttonContainer.add(yesButton);
					buttonContainer.add(noButton);
					buttonContainer.add(cancelButton);
					this.add(buttonContainer);
				},
				members: {
					callback: null,
					url: null,

					openExternal: function() {
						this.close();
						qx.core.Init.getApplication().showExternal(this.url);
					},

					openReplayShareAndDontAsk: function() {
						this.close();
						this.callback.call(null, true);
					},

					openReplayShare: function() {
						this.close();
						this.callback.call(null, false);
					}
				}
			});
		}

		function waitForGame() {
			try {
				if (typeof Parse !== 'undefined' && typeof qx !== 'undefined' && qx.core.Init.getApplication() && qx.core.Init.getApplication().initDone) {
					createReplayShare();
					ReplayShare.getInstance().initialize();
				}
				else {
					setTimeout(waitForGame, 1000);
				}
			}
			catch (e) {
				console.log('ReplayShare: ', e.toString());
			}
		}

		setTimeout(waitForGame, 1000);
	};

	var parseScript = document.createElement('script');
	parseScript.src = 'https://www.parsecdn.com/js/parse-1.2.19.min.js';
	parseScript.type = 'text/javascript';
	document.getElementsByTagName('head')[0].appendChild(parseScript);

	var script = document.createElement('script');
	script.innerHTML = '(' + main.toString() + ')();';
	script.type = 'text/javascript';
	document.getElementsByTagName('head')[0].appendChild(script);
})();
