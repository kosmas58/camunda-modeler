/**
 * Copyright Camunda Services GmbH and/or licensed to Camunda Services GmbH
 * under one or more contributor license agreements. See the NOTICE file
 * distributed with this work for additional information regarding copyright
 * ownership.
 *
 * Camunda licenses this file to you under the MIT; you may not use this file
 * except in compliance with the MIT License.
 */

import DmnModeler from 'dmn-js/lib/Modeler';
import DrdModeler from 'dmn-js-drd/lib/Modeler';
import DrdViewer from './DrdViewer';

import diagramOriginModule from 'diagram-js-origin';

import alignToOriginModule from '@bpmn-io/align-to-origin';
import addExporter from '@bpmn-io/add-exporter/add-exporter';

import completeDirectEditingModule from '../../bpmn/modeler/features/complete-direct-editing';
import propertiesPanelModule from 'dmn-js-properties-panel';
import propertiesProviderModule from 'dmn-js-properties-panel/lib/provider/camunda';

import drdAdapterModule from 'dmn-js-properties-panel/lib/adapter/drd';

import propertiesPanelKeyboardBindingsModule from '../../bpmn/modeler/features/properties-panel-keyboard-bindings';
import decisionTableKeyboardModule from './features/decision-table-keyboard';

import Flags, { DISABLE_ADJUST_ORIGIN } from '../../../../util/Flags';

import camundaModdleDescriptor from 'camunda-dmn-moddle/resources/camunda';

import editDrdModule from './features/edit-drd';
import openDrgElementModule from './features/open-drg-element';
import scheduleUpdateOverviewModule from './features/schedule-update-overview';
import updateOverviewModule from './features/update-overview';

import 'dmn-js/dist/assets/diagram-js.css';
import 'dmn-js/dist/assets/dmn-font/css/dmn-embedded.css';
import 'dmn-js/dist/assets/dmn-js-decision-table-controls.css';
import 'dmn-js/dist/assets/dmn-js-decision-table.css';
import 'dmn-js/dist/assets/dmn-js-drd.css';
import 'dmn-js/dist/assets/dmn-js-literal-expression.css';
import 'dmn-js/dist/assets/dmn-js-shared.css';

import 'dmn-js-properties-panel/dist/assets/dmn-js-properties-panel.css';

import dragger from '../../../../util/dom/dragger';

const EMPTY_MODULE = [ 'value', null ];

const OVERVIEW_ZOOM_FACTOR = 0.75;


export default class CamundaDmnModeler extends DmnModeler {

  constructor(options = {}) {

    const {
      moddleExtensions,
      drd,
      decisionTable,
      literalExpression,
      exporter,
      ...otherOptions
    } = options;

    super({
      ...otherOptions,
      drd: mergeModules(drd, [
        Flags.get(DISABLE_ADJUST_ORIGIN) ? diagramOriginModule : alignToOriginModule,
        propertiesPanelModule,
        propertiesProviderModule,
        drdAdapterModule,
        propertiesPanelKeyboardBindingsModule,
        scheduleUpdateOverviewModule
      ]),
      decisionTable: mergeModules(decisionTable, [
        decisionTableKeyboardModule,
        updateOverviewModule,
        {
          viewDrd: EMPTY_MODULE
        }
      ]),
      literalExpression: mergeModules(decisionTable, [
        updateOverviewModule,
        {
          viewDrd: EMPTY_MODULE
        }
      ]),
      moddleExtensions: {
        camunda: camundaModdleDescriptor,
        ...(moddleExtensions || {})
      }
    });

    this.on('viewer.created', ({ viewer }) => {

      viewer.on('commandStack.changed', event => {
        this._emit('view.contentChanged', event);
      });

      viewer.on('selection.changed', event => {
        this._emit('view.selectionChanged', event);
      });

      viewer.on([ 'directEditing.activate', 'directEditing.deactivate' ], event => {
        this._emit('view.directEditingChanged', event);
      });

      viewer.on('error', ({ error }) => {
        this._emit('error', {
          viewer,
          error
        });
      });

    });

    addExporter(exporter, this);

    this.addOverview();
  }

  /**
   * Get stack index of active viewer.
   *
   * @returns {?number} Stack index or null.
   */
  getStackIdx() {
    const viewer = this.getActiveViewer();

    if (!viewer) {
      return null;
    }

    const commandStack = viewer.get('commandStack', false);

    if (!commandStack) {
      return null;
    }

    return commandStack._stackIdx;
  }

  /**
   * Add DRD overview.
   */
  addOverview() {
    const overviewContainer = document.createElement('div');

    overviewContainer.classList.add('dmn-overview-container');

    this._container.appendChild(overviewContainer);

    const toggle = document.createElement('div');

    toggle.classList.add('toggle');

    toggle.textContent = 'DRD';

    toggle.addEventListener('click', () => {
      if (overviewContainer.classList.contains('collapsed')) {
        overviewContainer.classList.remove('collapsed');

        overviewContainer.style.width = '250px';
      } else {
        overviewContainer.classList.add('collapsed');
      }
    });

    let originalWidth;

    const handleResizeStart = event => {
      lastX = undefined;

      console.log('handleResize');

      originalWidth = parseInt(getComputedStyle(overviewContainer).width);

      const onDragStart = dragger(handleResize);

      console.log('originalWidth: ' + originalWidth);

      onDragStart(event);
    };

    let lastX;

    const handleResize = (_, delta) => {
      const {
        x
      } = delta;

      if (lastX !== undefined && lastX === x) {
        return;
      }

      console.log('x: ' + x);

      if (x === 0) {
        return;
      }

      lastX = x;

      console.log('new width: ' + Math.max(originalWidth + x, 0));

      let newWidth = Math.max(originalWidth + x, 0);

      const minWidth = 100;

      if (newWidth < minWidth) {
        newWidth = 0;

        overviewContainer.classList.add('collapsed');
      } else {
        overviewContainer.classList.remove('collapsed');
      }

      overviewContainer.style.width = newWidth + 'px';
    };

    toggle.draggable = true;

    toggle.ondragstart = handleResizeStart;

    overviewContainer.appendChild(toggle);

    const overview = this.overview = new DrdViewer({
      container: overviewContainer,
      drd: {
        additionalModules: [
          editDrdModule,
          openDrgElementModule
        ]
      }
    });

    const updateOverview = () => {
      console.log('update overview');

      this.saveXML((err, xml) => {
        if (err) {
          console.log(err);
        } else {
          overview.importXML(xml, onOverviewImport);
        }
      });
    };

    const onOverviewImport = (err, xml) => {
      if (err) {
        console.log(err);
      } else {
        overview.getActiveViewer().get('canvas').zoom(OVERVIEW_ZOOM_FACTOR);
      }
    };

    // (1) update overview on import
    this.on('import.parse.start', ({ xml }) => {
      overview.importXML(xml, onOverviewImport);
    });

    // (2) update overview on changes in modeler
    this.on('viewer.created', ({ viewer }) => {

      if (viewer instanceof DrdModeler) {
        const eventBus = viewer.get('eventBus');

        let foo = false;

        // schedule update on changes in DRD modeler
        this.on('views.changed', ({ activeView }) => {
          if (activeView.type === 'drd' && !foo) {

            foo = true;

            eventBus.once('scheduleUpdateOverview', () => {

              const onViewsChanged = ({ activeView }) => {
                if (activeView.type !== 'drd') {
                  this.off('views.changed', onViewsChanged);

                  foo = false;

                  updateOverview();
                }
              };

              this.on('views.changed', onViewsChanged);
            });
          }
        });
      } else {

        // update overview on changes in decision table and literal expression modeler
        viewer.on('updateOverview', updateOverview);
      }

    });

    let lastViewType;

    // (3) collapse overview
    this.on('views.changed', ({ activeView }) => {
      if (activeView.type === 'drd') {
        overviewContainer.classList.add('hidden');

        // this.getActiveViewer().get('canvas').zoom('fit-viewport');
      } else {
        overviewContainer.classList.remove('hidden');

        const activeViewer = overview.getActiveViewer();

        if (activeViewer) {
          activeViewer.get('eventBus').fire('drgElementOpened', {
            id: activeView.element.id,
            centerViewbox: lastViewType === 'drd'
          });
        }
      }

      lastViewType = activeView.type;
    });

    overview.once('import.done', () => {
      const activeViewer = overview.getActiveViewer();

      // (4) open DRG element on click
      activeViewer.on('openDrgElement', ({ id }) => {
        const view = this._views.find(({ element }) => {
          return element.id === id;
        });

        if (view && view.type !== 'drd') {
          this.open(view);
        }
      });

      // (5) edit DRD
      activeViewer.on('editDrd', () => {
        var view = this._views.find(({ type }) => {
          return type === 'drd';
        });

        if (view) {
          this.open(view);

          // switch to editing DRD
          overviewContainer.classList.add('hidden');
        }
      });
    });
  }
}


// helpers ///////////////////////

function mergeModules(editorConfig = {}, additionalModules) {

  const editorModules = editorConfig.additionalModules || [];

  return {
    ...editorConfig,
    additionalModules: [
      completeDirectEditingModule,
      ...editorModules,
      ...additionalModules
    ]
  };
}