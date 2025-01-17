const KEY = 'hashedKey';
const DEFAULT_PROMPT = `Your purpose is to help everyone quickly understand \
what this Salesforce flow does and how.\
Let us think step-by-step and briefly summarize the flow in the format: \
purpose of the flow, the main objects queried/inserted/updated, \
dependencies (labels, hard-coded ids, values, emails, names, etc) from outside the flow, \
the main conditions it evaluates, and any potential or evident issues.\
\\nFLOW: \\n`;
const ELEMENT_TYPE_START = 'start';

chrome.runtime.onMessage.addListener(
    function( request, sender, sendResponse ) {
        if( request.flowDefinition ) {
            parseFlow( request.flowDefinition );
        }
    }
);

document.getElementById( "setKey" ).addEventListener( 'click', function() { setKey(); } );

function parseValue( rightValue ) {
    let theValue = rightValue?.apexValue ??
                    rightValue?.booleanValue ??
                    rightValue?.dateTimeValue ??
                    rightValue?.dateValue ??
                    rightValue?.elementReference ??
                    rightValue?.numberValue ??
                    rightValue?.sobjectValue ??
                    rightValue?.stringValue ?? 'null';
    return theValue;
}

function convertOperator( operator ) {
    if( operator == undefined ) {
        return '=';
    }
    return ( operator.includes( 'Not' ) ? 'NOT ' : '' )
        + ( operator.includes( 'EqualTo' ) || operator.includes( 'Assign' ) ? '=' : operator );
}

function getFilters( action ) {
    let parameters = '';
    parameters += ( action.filters?.length > 0 ? ` / Filters: ` : '');
    parameters += getFieldOperations( action.filters );
    return parameters;
}

function addInputOutputParameters( action ) {
    let parameters = '';
    parameters += ( action.inputAssignments?.length > 0 ? ` / Input assignments: ` : '' );
    action.inputAssignments?.forEach(i => {
        parameters += ` / ${i.field} = ${parseValue(i.value)}`;
    });
    parameters += ( action.outputAssignments?.length > 0 ? ` / Output assignments: ` : '' );
    action.outputAssignments?.forEach(i => {
        parameters += ` / ${i.field} = ${parseValue(i.value)}`;
    });

    parameters += getFilters( action );

    parameters += ( action.inputParameters?.length > 0 ? ` / Input parameters: ` : '' );
    action.inputParameters?.forEach(i => {
        parameters += ` / ${i.name} = ${parseValue(i.value)}`;
    });
    parameters += ( action.outputParameters?.length > 0 ? ` / Output parameters: ` : '' );
    action.outputParameters?.forEach(o => {
        parameters += ` / ${o.name} = ${parseValue(o.value)}`;
    });
    return parameters;
}

function parenthesis( value ) {
    return ( value ? ' (' + value + ')' : '' );
}

function getFieldOperations( fieldOperations ) {
    let parameters = '';
    fieldOperations?.forEach( f => {
        let field = f.field ?? f.assignToReference ?? f.leftValueReference;
        let operator = convertOperator(f.operator);
        let value = f.value ?? f.rightValue;
        parameters += ` / ${field} ${operator} ${parseValue( value )}`;
    });
    return parameters;
}

function getStoreOutput( action ) {
    if( action.storeOutputAutomatically ) {
        return ` / Store output? = ${action.storeOutputAutomatically}`;
    }
    return '';
}

function getParameters( action ) {
    let parameters = '';
    let elementType = action.type;

    if( elementType == ELEMENT_TYPE_START ) {
        let type = action.triggerType + ' ' + action.recordTriggerType;
        parameters += `Type = ${type}`;
        parameters += ` / Object = ${action.object}`;
        parameters += ` / Requires Record Changed To Meet Criteria = ${action.doesRequireRecordChangedToMeetCriteria}`;
        parameters += getFilters( action );
        if( action.filterFormula ) {
            parameters += ` / Filter formula = ${action.filterFormula}`;
        }
        if( action.schedule ) {
            parameters += ` / Schedule = ${action.schedule.startDate} ${action.schedule.startTime} ${action.schedule.frequency}`;
        }
    }

    if( elementType == 'assignment' ) {
        parameters += getFieldOperations( action.assignmentItems );
    }

    if( elementType == 'variable' ) {
        let type = ( action.isCollection ? 'Collection of ' : '' ) + action.dataType;
        parameters += `Type = ${type}`;
        parameters += ` / Input = ${action.isInput}`;
        parameters += ` / Output = ${action.isOutput}`;
        parameters += ` / Value = ${parseValue( action.value )}`;
    }

    if( elementType == 'constant' ) {
        parameters += `Type = ${action.dataType}`;
        parameters += ` / Value = ${parseValue( action.value )}`;
    }

    if( elementType == 'textTemplate' ) {
        let text = action.text.replaceAll( '<', '&lt;' ).replaceAll( '>', '&gt;' );
        parameters += `Text = ${text}`;
        parameters += ` / Plain Text = ${action.isViewedAsPlainText}`;
    }

    if( elementType == 'formula' ) {
        parameters += `Type = ${action.dataType}`;
        parameters += ` / Expression = ${action.expression}`;
    }

    if( elementType == 'choice' ) {
        parameters += `Text = ${action.choiceText}`;
        parameters += ` / Type = ${action.dataType}`;
        parameters += ` / Value = ${parseValue( action.value )}`;
    }

    if( elementType == 'transform' ) {
        parameters += ` \n Target = ${ action.objectType ?? action.dataType }`;

        action.transformValues?.forEach( aTransformValue => {
            aTransformValue?.transformValueActions.forEach( aTransformAction => {
                let aValue = parseValue( aTransformAction.value );
                let transformDescription = aTransformAction.transformType + ': '
                            + ( aValue !== 'null' ? aValue : 'formula' )
                            + ( aTransformAction.outputFieldApiName ? ' to ' + aTransformAction.outputFieldApiName : '' );
                parameters += ` / ${transformDescription}`;
            } );
        } );
    }


    if( elementType == 'collectionProcessor' ) {
        parameters += `Collection = ${action.collectionReference}`;
        parameters += ` / Processing type = ${action.collectionProcessorType}`;
        parameters += ` / Assign next value to = ${action.assignNextValueToReference}`;
        parameters += ` / Filter formula = ${action.formula}`;
        parameters += ` / Output object = ${action.outputSObjectType}`;
        parameters += getFieldOperations( action.conditions );
    }

    if( elementType == 'dynamicChoiceSet' ) {
        parameters += `Collection = ${action.collectionReference}`;
        parameters += ` / Type = ${action.dataType}`;
        parameters += ` / Object = ${action.object}`;
        parameters += ` / Picklist object = ${action.picklistObject}`;
        parameters += ` / Picklist field = ${action.picklistField}`;
        parameters += ` / Display field = ${action.displayField}`;
    }

    if( elementType == 'actionCall' ) {
        parameters += `Type = ${action.actionType}`;
        parameters += getStoreOutput( action );
        parameters += addInputOutputParameters( action );
    }

    if( elementType == 'apexPluginCalls' ) {
        parameters += `Apex class = ${action.apexClass}`;
        parameters += addInputOutputParameters( action );
    }

    if( elementType == 'subflows' ) {
        parameters += `Flow = ${action.flowName}`;
        parameters += getStoreOutput( action );
        parameters += addInputOutputParameters( action );
    }

    if( elementType == 'recordLookup' ) {
        parameters += `Object = ${action.object}`;
        parameters += ` / Assign null if no records? = ${action.assignNullValuesIfNoRecordsFound}`;
        parameters += ` / First record only? = ${action.getFirstRecordOnly}`;
        parameters += getStoreOutput( action );
        parameters += getFieldOperations( action.filters );
    }

    if( elementType == 'recordCreate' ) {
        parameters += `Object = ${action.object}`;
        parameters += ` / Assign id? = ${action.assignRecordIdToReference}`;
        parameters += getStoreOutput( action );
        parameters += addInputOutputParameters( action );
    }

    if( elementType == 'recordUpdate' ) {
        parameters += `Reference = ${action.inputReference}`;
        if( action.object ) {
            parameters += ` / Object = ${action.object}`;
        }
        parameters += addInputOutputParameters( action );
        parameters += getFieldOperations( action.filters );
    }

    if( elementType == 'recordDelete' ) {
        parameters += `Reference = ${action.inputReference}`;
        if( action.object ) {
            parameters += ` / Object = ${action.object}`;
        }
        parameters += getFieldOperations( action.filters );
    }

    if( elementType == 'screen' ) {
        action.fields.forEach( f => {
            parameters += ` / ${f.fieldText ?? ''} ${f.dataType ?? ''} ${f.fieldType ?? ''} ${f.objectFieldReference ?? ''}`;
        });
    }

    if( elementType == 'loop' ) {
        parameters += `Collection = ${action.collectionReference}`;
        parameters += ` / Order = ${action.iterationOrder}`;
    }

    if( parameters.indexOf( ' / ' ) == 0 ) {
        parameters = parameters.substring( 2 );
    }

    return parameters;
}

function getMDTableRows( actionMap ) {
    let stepByStepMDTable = '';
    for( const [ identifier, action ] of actionMap ) {
        let elementType = action.type;
        let faultElement = action.faultElement;
        let parameters = action.parameters;

        let nextElement = action.connector?.targetReference;
        if( nextElement == undefined ) {
            nextElement = action.defaultConnector?.targetReference;
        }
        if( nextElement == undefined ) {
            nextElement = '';
        }

        let prefix = `|${action.fullDescription}|${elementType}|${ parameters }|`;

        // handle elements with multiple rows
        if( elementType == ELEMENT_TYPE_START ) {
            stepByStepMDTable += `${prefix}Runs immediately|${ nextElement }|\n`;
            prefix = '||||';
            if( action.scheduledPaths ) {
                action.scheduledPaths.forEach( s => {
                    let nextElement = s.connector?.targetReference;

                    let condition = `${s.label} / ${s.offsetNumber} ${s.offsetUnit} `
                                + `${( s.timeSource == 'RecordField' ? s.recordField : 'RecordTriggerEvent' )}`;
                    stepByStepMDTable += `${prefix}${condition}|${nextElement}|\n`;
                } );
            }
            continue;
        }

        if( elementType == 'decision' ) {
            nextElement = action.defaultConnector?.targetReference;
            stepByStepMDTable += `${prefix}${action.defaultCondition}|${ nextElement }|\n`;
            prefix = '||||';
        }

        if( elementType == 'loop' ) {
            stepByStepMDTable += `${prefix}Next value|${ action.nextValueConnector?.targetReference }|\n`;
            prefix = '||||';
            stepByStepMDTable += `${prefix}No more values|${ action.noMoreValuesConnector?.targetReference }|\n`;

            continue;
        }

        if( elementType == 'wait' ) {
            let elementCondition = '';
            action.waitEvents?.forEach( w => {
                elementCondition += `${w.label}`;
                elementCondition += ` \ Type: ${w.eventType}`;
                elementCondition += getFieldOperations( w.conditions );
                nextElement = w.connector?.targetReference;
                stepByStepMDTable += `${prefix}${elementCondition}|${ nextElement }|\n`;
                prefix = '||||';
            } );
            continue;
        }

        // check for rule conditions
        if( action.rules == undefined || action.rules.length == 0 ) {
            if( nextElement && action.defaultConnectorLabel ) {
                nextElement += ' ' + parenthesis( action.defaultConnectorLabel );
            }
            // if no conditions, just add the default condition
            stepByStepMDTable += `${prefix}${action.defaultCondition}|${ nextElement }|\n`;

            if( faultElement ) {
                prefix = '||||';
                stepByStepMDTable += `${prefix}fault|${ faultElement }|\n`;
            }

        } else {
            // add row for each rule/branch
            for( let r = 0; r < action.rules.length; r++ ) {
                let rule = action.rules[ r ];
                let elementCondition = rule.name + parenthesis( rule.label );
                let conditionNextElement = rule.connector?.targetReference;
                // add expression for each condition within the rule
                elementCondition += getFieldOperations( rule.conditions );

                stepByStepMDTable += `${prefix}${ elementCondition }|${ conditionNextElement }|\n`;
                prefix = '||||';
            }
        }
    }

    return stepByStepMDTable;
}

function parseFlow( flowDefinition ) {
    // console.log( flowDefinition );

    let flowName = 'Flow:  ' + flowDefinition.label;
    let flowDescription = flowDefinition.description;


    // identify initial step
    let startElement = flowDefinition.startElementReference ?? flowDefinition.start?.connector?.targetReference;

    // Initialize firstElement
    let firstElement = flowDefinition.start || {};
    firstElement.name = 'Start';
    firstElement.fullDescription = firstElement.name;
    firstElement.type = 'start';
    firstElement.branchArray = [];
    firstElement.branchLabelArray = []; // Initialize branchLabelArray
    firstElement.parameters = getParameters(firstElement);

    if (firstElement.connector?.targetReference) {
        firstElement.branchArray.push(firstElement.connector.targetReference);
        firstElement.branchLabelArray.push(''); // Add label if needed
    }

    firstElement.scheduledPaths?.forEach(s => {
        firstElement.branchArray.push(s.connector?.targetReference);
        firstElement.branchLabelArray.push(''); // Add label if needed
    });

    // start map of actions indexed by name with the starting element
    let actionMap = new Map();
    actionMap.set(firstElement.name, firstElement);

    // collect nodes in the flow metadata and index them in a map
    const definitionMap = new Map( [
        [ 'recordLookups', flowDefinition.recordLookups ]
        , [ 'recordCreates', flowDefinition.recordCreates ]
        , [ 'recordUpdates', flowDefinition.recordUpdates ]
        , [ 'recordDeletes', flowDefinition.recordDeletes ]
        , [ 'recordRollbacks', flowDefinition.recordRollbacks ]
        , [ 'assignments', flowDefinition.assignments ]
        , [ 'decisions', flowDefinition.decisions ]
        , [ 'screens', flowDefinition.screens ]
        , [ 'loops', flowDefinition.loops ]
        , [ 'steps', flowDefinition.steps ]
        , [ 'subflows', flowDefinition.subflows ]
        , [ 'actionCalls', flowDefinition.actionCalls ]
        , [ 'apexPluginCalls', flowDefinition.apexPluginCalls ]
        , [ 'collectionProcessors', flowDefinition.collectionProcessors ]
        , [ 'transforms', flowDefinition.transforms ]
        , [ 'waits', flowDefinition.waits ]
        , [ 'dynamicChoiceSets', flowDefinition.dynamicChoiceSets ]
        , [ 'variables', flowDefinition.variables ]
        , [ 'textTemplates', flowDefinition.textTemplates ]
        , [ 'formulas', flowDefinition.formulas ]
        , [ 'constants', flowDefinition.constants ]
        , [ 'choices', flowDefinition.choices ]
    ] );

    // reorganize flow elements into a single map indexed by name
    for( const [ typeName, array ] of definitionMap ) {
        if( ! array || array.length <= 0 ) {
            continue;
        }
        for( let i = 0; i < array.length; i++ ) {
            let element = array[ i ];
            element.type = typeName.substring( 0, typeName.length - 1 );

            element.fullDescription = element.name
                                    + (element.label ? ` (${element.label})` : '')
                                    + (element.description ? ` / ${element.description}` : '');

            element.branchArray = [];
            element.branchLabelArray = []; // Initialize branchLabelArray

            if (element.nextElement != undefined) {
                element.branchArray.push(element.nextElement);
                element.branchLabelArray.push(`${element.label} is true`);
            }

            if (element.faultConnector?.targetReference) {
                element.faultElement = element.faultConnector.targetReference;
                element.branchArray.push(element.faultElement);
                element.branchLabelArray.push(`fails on ${element.label}`);
            }

            if (element.type == 'loop') {
                element.branchArray.push(element.nextValueConnector?.targetReference);
                element.branchLabelArray.push(`next value on ${element.label}`);

                element.branchArray.push(element.noMoreValuesConnector?.targetReference);
                element.branchLabelArray.push(`no more values on ${element.label}`);
            }

            // create explanation containing parameters of the element
            element.parameters = getParameters( element );

            actionMap.set( element.name, element );
        }
    }

    // assign sequential index to elements, following all their branches recursively
    index = 0;
    let currentElement = actionMap.get( firstElement.name );
    assignIndexToElements( actionMap, currentElement, currentElement, 'start' );

    // sort elements by index so that table will be ordered by execution
    actionMap = new Map( [ ...actionMap.entries() ].sort( ( a, b ) => a[ 1 ].index - b[ 1 ].index ) );

    // TODO:  generate explanation by associating outcomes with decisions/branches
    let explanation = '';
    for( const [ identifier, action ] of actionMap ) {
        let elementType = action.type;
        let parentBranch = action.parentBranch;
        let parentBranchAction = '';
        if( parentBranch != undefined ) {
            parentBranchAction = ( parentBranch.type == 'decision' ? 'after checking' : '' )
                                + ( parentBranch.type == 'start' ? 'at the' : '' )
                                + ( parentBranch.type == 'loop' ? 'when loop has' : '' )
                                + ( parentBranch.type == 'actionCall' ? 'after calling action' : '' )
                                + ( parentBranch.type == 'wait' ? 'after event' : '' );
        }
        let conditionExplained = `${parentBranchAction ?? ''} ${action.conditionLabel ?? ''}`;

        if( elementType === 'recordCreate'
                || elementType === 'recordUpdate'
                || elementType === 'recordDelete'
                || elementType === 'recordRollback' ) {
            let recordAction = elementType.replace( 'record', '' ).toLowerCase() + 's';
            explanation += ` \n ${recordAction} ${action.object ?? action.inputReference} ${conditionExplained}`;
        }
        if( elementType === 'recordLookup' ) {
            explanation += ` \n queries ${action.object} ${conditionExplained}`;
        }
        // if( elementType === 'assignment' ) {
        //     explanation += ` \n assigns ${action.label} ${conditionExplained}`;
        // }
        if( elementType === 'actionCall' ) {
            explanation += ` \n calls action ${action.label} ${conditionExplained}`;
        }
        if( elementType === 'screen' ) {
            explanation += ` \n prompts screen ${action.label} ${conditionExplained}`;
        }

        if( elementType == 'transform' ) {
            explanation += ` \n transforms ${ action.objectType ?? action.dataType }`;
        }

        // let parameters = action.parameters;
    }
    // console.log( explanation );

    // display default explanation
    let explainerDivElement = document.getElementById( 'defaultExplainer' );
    explainerDivElement.innerHTML = "";
    let explanationHTML = document.createElement( 'span' );
    explanationHTML.innerHTML = '<b>This flow:  </b>' + explanation.replaceAll( /\n/g, '<br />' );
    explainerDivElement.appendChild( explanationHTML );

    // generate itemized description of the flow
    let stepByStepMDTable = `${flowName}\nDescription: ${flowDescription}\nType: ${flowDefinition.processType}\n\n`
                        + '|Element name|Type|Parameters|Condition|Condition next element|\n'
                        + '|-|-|-|-|-|\n';
    stepByStepMDTable += getMDTableRows( actionMap );

    createTableFromMarkDown( flowName, actionMap, stepByStepMDTable );

    // let csvFlow = getCSVFromMarkDown( stepByStepMDTable );
    // console.log( csvFlow );

    // prepare to call OpenAI
    let responseSpan = document.getElementById( "response" );
    responseSpan.innerText = '';

    const errorSpan = document.getElementById( "error" );
    let storedKey = localStorage.getItem( KEY );
    if( ! storedKey ) {
        const spinner = document.getElementById( "spinner" );
        spinner.style.display = "none";
        responseSpan.innerText = '';
        errorSpan.innerText = "Please set an OpenAI key to get an AI explanation.";
        return;
    }

    // since we have OpenAI key, display button to call it
    let gptInputs = document.getElementById( 'gptInputs' );
    gptInputs.innerHTML = "";
    let gptQuestionLabel = document.createElement( 'label' );
    gptQuestionLabel.innerText = 'Ask your question or leave blank for default prompt:';
    gptQuestionLabel.setAttribute( 'for', 'gptQuestion' );
    let gptQuestion = document.createElement( 'input' );
    gptQuestion.setAttribute( 'id', 'gptQuestion' );
    let gptButton = document.createElement( 'button' );
    gptButton.innerHTML = 'Ask GPT';
    let gptSelection = document.createElement( 'div' );
    gptSelection.innerHTML += `
        <input type="radio" id="gpt-4o" name="gpt-version" value="gpt-4o" checked>
        <label for="gpt-4o">gpt-4o</label>
        <input type="radio" id="gptVersion" name="gpt-version" value="gpt-3.5-turbo" >
        <label for="gpt-3.5-turbo">gpt-3.5-turbo</label>`;

    let gptDialogContainer = document.createElement( 'div' );
    gptDialogContainer.appendChild( gptQuestionLabel );
    gptDialogContainer.appendChild( gptQuestion );
    gptDialogContainer.appendChild( gptButton );
    gptDialogContainer.appendChild( gptSelection );
    gptInputs.appendChild( gptDialogContainer );

    // make button call GPT
    gptButton.addEventListener( 'click', () => {
        const spinner = document.getElementById( "spinner" );
        spinner.style.display = "inline-block";

        // extract OpenAI key
        let encodedKey = JSON.parse( storedKey );
        let keyArray = [];
        Object.keys( encodedKey ).forEach( idx => keyArray.push( encodedKey[ idx ] ) );
        let intArray = new Uint8Array( keyArray );
        let dec = new TextDecoder();
        let openAIKey = dec.decode( intArray );

        if( ! openAIKey ) {
            return;
        }

        responseSpan.innerText = 'Asking GPT to explain current flow...';

        // accept user question, otherwise use default prompt
        let prompt;
        let gptQuestion = document.getElementById( 'gptQuestion' );
        if( gptQuestion && gptQuestion.value ) {
            prompt = gptQuestion.value + '\\nFLOW: \\n';
        } else {
            prompt = `This flow: ${explanation.replaceAll( /\n/g, '\\n' )} ` + DEFAULT_PROMPT;
        }

        let gptModel = document.querySelector( 'input[name="gpt-version"]:checked' ).value;

        let dataObject = {
            currentURL: window.location.href,
            resultData: stepByStepMDTable,
            // resultData: csvFlow,
            prompt: prompt,
            gptModel: gptModel
        };
        sendToGPT( dataObject, openAIKey );
    } );

    // Create the Mermaid diagram
    createMermaidDiagram(flowName, actionMap);
}

// function getCSVFromMarkDown( stepByStepMDTable ) {
//     let table = stepByStepMDTable
//                         .replaceAll( "|\n|-|-|-|-|-|-|\n|", "\"\n\"" )
//                         .replaceAll( "\n|", "\n\"" )
//                         .replaceAll( "|\n", "\"\n" )
//                         .replaceAll( "|", "\",\"" )
//                         .replaceAll( " / ", "\n" );
//     return table;
// }

function createTableFromMarkDown(flowName, actionMap, stepByStepMDTable) {
    // Parse the markdown and generate HTML using ShadCN components
    const flowDivElement = document.getElementById('flow');
    flowDivElement.innerHTML = ''; // Clear previous content

    // Create a container using Tailwind CSS
    const container = document.createElement('div');
    container.className = 'space-y-4';

    // Add a header
    const header = document.createElement('h2');
    header.className = 'text-2xl font-bold';
    header.textContent = flowName;
    container.appendChild(header);

    // Parse the markdown table into data
    const rows = parseMarkdownTable(stepByStepMDTable);

    // Create cards to display each step
    rows.forEach((row) => {
        const card = document.createElement('div');
        card.className = 'card';

        const elementName = document.createElement('h2');
        elementName.textContent = row['Element name'];
        card.appendChild(elementName);

        const type = document.createElement('p');
        type.innerHTML = `<strong>Type:</strong> ${row['Type']}`;
        card.appendChild(type);

        const parameters = document.createElement('p');
        parameters.innerHTML = `<strong>Parameters:</strong> ${row['Parameters']}`;
        card.appendChild(parameters);

        const condition = document.createElement('p');
        condition.innerHTML = `<strong>Condition:</strong> ${row['Condition']}`;
        card.appendChild(condition);

        const nextElement = document.createElement('p');
        nextElement.innerHTML = `<strong>Next Element:</strong> ${row['Condition next element']}`;
        card.appendChild(nextElement);

        // Add a button to copy the card content
        const copyButton = document.createElement('button');
        copyButton.className = 'mt-2 px-4 py-2 bg-blue-600 text-white rounded-md';
        copyButton.textContent = 'Copy to Clipboard';
        copyButton.addEventListener('click', () => {
            copyCardContent(card);
        });
        card.appendChild(copyButton);

        container.appendChild(card);
    });

    flowDivElement.appendChild(container);
}

// Helper function to parse the markdown table into an array of objects
function parseMarkdownTable(markdown) {
    const lines = markdown.trim().split('\n');

    // Find the index of the header line (line that starts with '|Element name|')
    const headerIndex = lines.findIndex(line => line.startsWith('|Element name|'));
    if (headerIndex === -1) {
        console.error('Header line not found in markdown table.');
        return [];
    }

    // Extract headers
    const headers = lines[headerIndex].split('|').slice(1, -1).map(h => h.trim());

    // Initialize data array
    const data = [];

    // Loop through data lines, starting after the header separator line
    for (let i = headerIndex + 2; i < lines.length; i++) {
        const line = lines[i];
        if (line.trim() === '') continue; // Skip empty lines
        const cells = line.split('|').slice(1, -1).map(c => c.trim());

        // Map headers to cells
        const row = {};
        headers.forEach((header, idx) => {
            row[header] = cells[idx] || '';
        });
        data.push(row);
    }

    return data;
}

// Helper function to copy card content to clipboard
function copyCardContent(card) {
    const tempElement = document.createElement('div');
    tempElement.innerHTML = card.innerHTML;
    // Remove the copy button from the copied content
    const button = tempElement.querySelector('button');
    if (button) {
        button.remove();
    }
    const text = tempElement.textContent;
    navigator.clipboard.writeText(text).then(() => {
        alert('Card content copied to clipboard');
    });
}

let index = 0;
let forksArray = [];
function assignIndexToElements( actionMap, currentElement, parentBranch, conditionLabel ) {
    // assign order number to current element
    index++;
    currentElement.index = index;
    // console.log( index, currentElement.name );

    // link element to parent branch it inherited
    // so all elements will belong to a parent branch
    let currentParentBranch = parentBranch;
    let currentConditionLabel = conditionLabel;
    currentElement.parentBranch = currentParentBranch;
    currentElement.conditionLabel = currentConditionLabel;

    // check all branches flowing from the current element
    let nbrBranches = currentElement.branchArray.length;
    if( nbrBranches > 1 ) {
        // store current element if 2+ branches flow out of it
        forksArray.push( currentElement );

        // if current element is a branch, it will be
        // the parent branch of the next elements
        currentParentBranch = currentElement;
    }
    for( let i = 0; i < nbrBranches; i++ ) {
        if( nbrBranches > 1 ) {
            currentConditionLabel = currentElement.branchLabelArray[ i ];
        }

        // check next element in each branch
        let aBranch = currentElement.branchArray[ i ];
        if( aBranch == null || aBranch == undefined ) {
            continue;
        }

        // if element has index, then it has already been visited so skip it
        let branchNextElement = actionMap.get( aBranch );
        if( branchNextElement.index ) {
            continue;
        }

        // continue in this branch, assigning index to elements,
        // recursively until all elements have indexes
        assignIndexToElements( actionMap, branchNextElement
                            , currentParentBranch, currentConditionLabel );
    }
}

function setKey() {
    const errorSpan = document.querySelector( "#error" );
    errorSpan.innerText = "";

    const openAIKeyInput = document.querySelector( "input#openAIKey" );

    let enc = new TextEncoder();
    let encrypted = enc.encode( openAIKeyInput.value );

    localStorage.setItem( KEY, JSON.stringify( encrypted ) );
    errorSpan.innerText = "An AI explanation should appear here the next time you open this page.";
}

function verySimpleHash( data ) {
    let hash = 0;
    for( let i = 0, len = data.length; i < len; i++ ) {
        let chr = data.charCodeAt( i );
        hash = ( hash << 5 ) - hash + chr;
        hash |= 0;
    }
    return hash;
}

const CACHE_DURATION = 300000; // 5 min
function sendToGPT( dataObject, openAIKey ) {
    const spinner = document.getElementById( "spinner" );
    const responseSpan = document.getElementById( "response" );
    // const errorSpan = document.getElementById( "error" );
    try {
        if( ! dataObject ) {
            responseSpan.innerText = 'No data received from current page.';
            spinner.style.display = "none";
            return;
        }

        let { currentURL, resultData, prompt, gptModel } = dataObject;

        if( ! resultData ) {
            responseSpan.innerText = 'No data to send.';
            spinner.style.display = "none";
            return;
        }

        // scan cache for clean up
        Object.keys( sessionStorage ).forEach( aKey => {
            let parsedCachedResponse = JSON.parse( sessionStorage.getItem( aKey ) );

            // if older than cache limit
            let cacheAgeMs = Math.abs( Date.now() - parsedCachedResponse?.cachedDate );
            if( cacheAgeMs >= CACHE_DURATION ) {
                sessionStorage.removeItem( aKey );
            }
        } );

        // attempt to retrieve previously stored response
        const cacheKey = verySimpleHash( currentURL + prompt + resultData.substring( 0, 20 ) ); // JSON.stringify( { currentURL, resultData, prompt } );
        const cachedResponse = sessionStorage.getItem( cacheKey );
        if( cachedResponse != null && cachedResponse != undefined ) {
            let parsedCachedResponse = JSON.parse( cachedResponse );

            // only use cached response if newer than cache limit
            let cacheAgeMs = Math.abs( Date.now() - parsedCachedResponse?.cachedDate );
            if( cacheAgeMs < CACHE_DURATION ) {
                // display response
                responseSpan.innerText = 'OpenAI (cached response): ' + parsedCachedResponse.parsedResponse;
                spinner.style.display = "none";
                return;
            }
        }

        // use parameters recommended for Code Comment Generation
        let temperature = 0.3;  // was 1;
        let top_p = 0.2; // was 1;
        let max_tokens = 2000; // was 256 then 900
        let frequency_penalty = 0;
        let presence_penalty = 0;
        let model = ( gptModel ? gptModel : 'gpt-3.5-turbo' );
        let systemPrompt = 'You are an expert at troubleshooting and explaining Salesforce flows.';
        // was 'You are a helpful assistant.';

        // replace characters that would invalidate the JSON payload‘
        let data = //`Current page URL ${currentURL}\\n` +
                    resultData.replaceAll( '\n', '\\n ' ).replaceAll( '"', '“' )
                                .replaceAll( '\'', '‘' ).replaceAll( '\\', '\\\\' )
                                .replaceAll( '\t', ' ' ).replaceAll( '   ', ' ' );

        // check size of data and select a bigger model as needed
        if( data.length > 16200 ) {

            model = 'gpt-4o'; // 'gpt-3.5-turbo-16k';
            // truncate data as needed
            if( data.length > 130872 ) {
                data = data.substring( 0, 130872 );
            }
        }

        // build prompt with current page data in a request
        // let payload = `{ "model":"${model}","messages":[{"role":"system","content":"${systemPrompt}"},{"role":"user","content":"${prompt} ${data}"}],"temperature": ${temperature},"max_tokens":${max_tokens},"top_p":${top_p},"frequency_penalty":${frequency_penalty},"presence_penalty":${presence_penalty} }`;
        let sysMessage = `{"role":"system","content":[{"type":"text","text":"${systemPrompt}"}]}`;
        let userMessage = `{"role":"user","content":[{"type":"text","text":"${prompt} ${data}"}]}`;
        let payload = `{ "model":"${model}","messages":[${sysMessage},${userMessage}],"temperature": ${temperature},"max_tokens":${max_tokens},"top_p":${top_p},"frequency_penalty":${frequency_penalty},"presence_penalty":${presence_penalty} }`;

        // prepare request
        let url = "https://api.openai.com/v1/chat/completions";
        let xhr = new XMLHttpRequest();
        xhr.open( "POST", url );
        xhr.setRequestHeader( "Content-Type", "application/json" );
        xhr.setRequestHeader( "Authorization", "Bearer " + openAIKey );

        // submit request and receive response
        responseSpan.innerText = 'Waiting for OpenAI response...';
        xhr.onreadystatechange = function () {
            if( xhr.readyState === 4 ) {
                // console.log( xhr.status );
                // console.log( xhr.responseText );
                let open_ai_response = xhr.responseText;
                // console.log( open_ai_response );

                let parsedResponse = JSON.parse( open_ai_response );

                console.log( parsedResponse.usage );

                if( parsedResponse.error ) {
                    parsedResponse = parsedResponse.error.message + ` (${parsedResponse.error.type})`;

                } else {
                    let finishReason = parsedResponse.choices[ 0 ].finish_reason;
                    parsedResponse = parsedResponse.choices[ 0 ].message.content;
                    // The token count of prompt + max_tokens will not exceed the model's context length.
                    if( finishReason == 'length' ) {
                        parsedResponse = parsedResponse + ' (RESPONSE TRUNCATED DUE TO LIMIT)';
                    }
                }

                // store response in local cache
                const cacheKey = JSON.stringify( { currentURL, resultData, prompt } );
                sessionStorage.setItem( cacheKey, JSON.stringify( {
                                                cachedDate: Date.now()
                                                , parsedResponse } )
                                        );

                // display response
                responseSpan.innerText = parsedResponse;
                convertResponseFromMarkdown();
                spinner.style.display = "none";
            }
        };

        xhr.send( payload );
    } catch( e ) {
        responseSpan.innerText = e.message;
        spinner.style.display = "none";
    }
}

function convertResponseFromMarkdown() {
    const span = document.getElementById( "response" );
    let response = span.innerHTML;

    // Replace **text** with <b>text</b>
    response = response.replace(/\*\*(.*?)\*\*/g, "<b>$1</b>");
    // Replace ### Heading with <h4>Heading</h4>
    response = response.replace(/### (.*?)(<br>|$)/gm, "<h4>$1</h4>$2");

    span.innerHTML = response;
}

// Function to create and render the Mermaid diagram
function createMermaidDiagram(flowName, actionMap) {
    let mermaidDefinition = 'graph LR\n';

    // Build the Mermaid definition
    actionMap.forEach((action) => {
        const currentElement = sanitizeElementName(action.name);
        const actionLabel = action.label || action.name || '';
        const currentLabel = `${action.type}: ${sanitizeLabel(actionLabel)}`;
        mermaidDefinition += `${currentElement}["${currentLabel}"]\n`;

        // Handle branches
        if (action.branchArray && action.branchArray.length > 0) {
            action.branchArray.forEach((branchTarget, index) => {
                if (branchTarget) {
                    const branchElement = actionMap.get(branchTarget);
                    if (branchElement) {
                        const branchElementName = sanitizeElementName(branchElement.name);
                        const rawBranchLabel = action.branchLabelArray[index] || '';
                        const branchLabel = sanitizeLabel(rawBranchLabel);

                        // Only include the label if it's not empty
                        if (branchLabel) {
                            mermaidDefinition += `${currentElement} -- "${branchLabel}" --> ${branchElementName}\n`;
                        } else {
                            mermaidDefinition += `${currentElement} --> ${branchElementName}\n`;
                        }
                    }
                }
            });
        }
        // Handle connectors and fault paths as needed...
    });

    // Log the Mermaid definition for debugging
    console.log('Mermaid Definition:\n', mermaidDefinition);

    // Get the Mermaid container
    const mermaidDiv = document.getElementById('mermaidDiagram');

    // Clear previous content and set the diagram definition
    mermaidDiv.innerHTML = '';
    mermaidDiv.textContent = mermaidDefinition;
    mermaidDiv.classList.add('mermaid');

    // Initialize Mermaid and render the diagram
    if (window.mermaid) {
        try {
            mermaid.run({
                querySelector: '#mermaidDiagram',
            });
        } catch (error) {
            console.error('Mermaid failed to render:', error);
            mermaidDiv.textContent = 'An error occurred while rendering the diagram.';
        }
    }
}

// Helper function to sanitize element names for Mermaid
function sanitizeElementName(name) {
    if (!name) return '';
    // Replace non-alphanumeric characters with underscores
    return name.replace(/[^a-zA-Z0-9_$]/g, '_');
}

// Helper function to sanitize labels for Mermaid
function sanitizeLabel(label) {
    if (!label) return '';
    // Escape problematic characters
    return label.toString()
                .replace(/"/g, '\\"')
                .replace(/\n/g, ' ')
                .replace(/\[/g, '&#91;')
                .replace(/\]/g, '&#93;')
                .replace(/>/g, '&gt;')
                .replace(/</g, '&lt;');
}

document.addEventListener('DOMContentLoaded', function () {
    if (window.mermaid) {
        // Initialize Mermaid with desired configuration
        mermaid.initialize({
            startOnLoad: false,
            logLevel: 'debug',
            theme: 'default', // You can set a theme if desired
            // Other configuration options
        });

        const flowDefinition = {
            label: 'My Flow',
            description: 'This is a sample flow.',
            start: {
                connector: {
                    targetReference: 'StartNode'
                }
            },
            // Add other necessary properties and elements of your flow here
        };
        // Now, parse and render the flow
        parseFlow(flowDefinition);
    } else {
        console.error('Mermaid is not defined. Ensure mermaid.min.js is loaded before popup.js.');
    }
});