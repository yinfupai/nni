import React from 'react';
import { DefaultButton, IColumn, Icon, PrimaryButton, Stack, StackItem, Checkbox } from '@fluentui/react';
import { Trial } from '@model/trial';
import { EXPERIMENT, TRIALS } from '@static/datamodel';
import { convertDuration, formatTimestamp, copyAndSort, parametersType, _inferColumnTitle } from '@static/function';
import { SortInfo, SearchItems } from '@static/interface';
import { blocked, copy, LineChart, tableListIcon } from '@components/fluent/Icon';
import Customize from './tableFunction/CustomizedTrial';
import TensorboardUI from './tableFunction/tensorboard/TensorboardUI';
import Search from './tableFunction/search/Search';
import ExpandableDetails from '@components/common/ExpandableDetails/ExpandableIndex';
import ChangeColumnComponent from '../ChangeColumnComponent';
import Compare from './tableFunction/CompareIndex';
import KillJobIndex from './tableFunction/killJob/KillJobIndex';
import { getTrialsBySearchFilters } from './tableFunction/search/searchFunction';
import PaginationTable from '@components/common/PaginationTable';
import CopyButton from '@components/common/CopyButton';
import TooltipHostIndex from '@components/common/TooltipHostIndex';

require('echarts/lib/chart/line');
require('echarts/lib/component/tooltip');
require('echarts/lib/component/title');

type SearchOptionType = 'id' | 'trialnum' | 'status' | 'parameters';

const defaultDisplayedColumns = ['sequenceId', 'id', 'duration', 'status', 'latestAccuracy'];

interface TableListProps {
    tableSource: Trial[];
}

interface TableListState {
    displayedItems: any[];
    displayedColumns: string[];
    columns: IColumn[];
    searchType: SearchOptionType;
    searchText: string;
    selectedRowIds: string[];
    customizeColumnsDialogVisible: boolean;
    compareDialogVisible: boolean;
    intermediateDialogTrial: Trial[] | undefined;
    copiedTrialId: string | undefined;
    sortInfo: SortInfo;
    searchItems: Array<SearchItems>;
    relation: Map<string, string>;
}

class TableList extends React.Component<TableListProps, TableListState> {
    private _expandedTrialIds: Set<string>;

    constructor(props: TableListProps) {
        super(props);

        this.state = {
            displayedItems: [],
            displayedColumns:
                localStorage.getItem('columns') !== null
                    ? // eslint-disable-next-line @typescript-eslint/no-non-null-assertion
                      JSON.parse(localStorage.getItem('columns')!)
                    : defaultDisplayedColumns,
            columns: [],
            searchType: 'id',
            searchText: '',
            customizeColumnsDialogVisible: false,
            compareDialogVisible: false,
            selectedRowIds: [],
            intermediateDialogTrial: undefined,
            copiedTrialId: undefined,
            sortInfo: { field: '', isDescend: true },
            searchItems: [],
            relation: parametersType()
        };

        this._expandedTrialIds = new Set<string>();
    }

    componentDidUpdate(prevProps: TableListProps): void {
        if (this.props.tableSource !== prevProps.tableSource) {
            this._updateTableSource();
        }
    }

    componentDidMount(): void {
        this._updateTableSource();
    }

    render(): React.ReactNode {
        const {
            displayedItems,
            columns,
            customizeColumnsDialogVisible,
            compareDialogVisible,
            displayedColumns,
            selectedRowIds,
            intermediateDialogTrial,
            copiedTrialId,
            searchItems
        } = this.state;

        return (
            <div id='tableList'>
                <Stack horizontal className='panelTitle' style={{ marginTop: 10 }}>
                    <span style={{ marginRight: 12 }}>{tableListIcon}</span>
                    <span className='fontColor333'>Trial jobs</span>
                </Stack>
                <Stack horizontal className='allList'>
                    <StackItem>
                        <Stack horizontal horizontalAlign='end' className='allList'>
                            <Search
                                searchFilter={searchItems} // search filter list
                                changeSearchFilterList={this.changeSearchFilterList}
                            />
                        </Stack>
                    </StackItem>

                    <StackItem styles={{ root: { position: 'absolute', right: '0' } }}>
                        <DefaultButton
                            className='allList-button-gap'
                            text='Add/Remove columns'
                            onClick={(): void => {
                                this.setState({ customizeColumnsDialogVisible: true });
                            }}
                        />
                        <DefaultButton
                            text='Compare'
                            className='allList-compare'
                            onClick={(): void => {
                                this.setState({
                                    compareDialogVisible: true
                                });
                            }}
                            disabled={selectedRowIds.length === 0}
                        />
                        {/* compare model: trial intermediates graph; table: id,no,status,default dict value */}
                        {compareDialogVisible && (
                            <Compare
                                title='Compare trials'
                                trials={this.props.tableSource.filter(trial => selectedRowIds.includes(trial.id))}
                                onHideDialog={(): void => {
                                    this.setState({ compareDialogVisible: false });
                                }}
                                changeSelectTrialIds={this.changeSelectTrialIds}
                            />
                        )}
                        <TensorboardUI
                            selectedRowIds={selectedRowIds}
                            changeSelectTrialIds={this.changeSelectTrialIds}
                        />
                    </StackItem>
                </Stack>
                {columns && displayedItems && (
                    <PaginationTable
                        columns={columns.filter(
                            column =>
                                displayedColumns.includes(column.key) ||
                                ['_expand', '_operation', '_selected'].includes(column.key)
                        )}
                        items={displayedItems}
                        compact={true}
                        selectionMode={0}
                        selectionPreservedOnEmptyClick={true}
                        onRenderRow={(props): any => {
                            // eslint-disable-next-line @typescript-eslint/no-non-null-assertion
                            return <ExpandableDetails detailsProps={props!} isExpand={props!.item._expandDetails} />;
                        }}
                    />
                )}
                {intermediateDialogTrial !== undefined && (
                    <Compare
                        title='Intermediate results'
                        trials={intermediateDialogTrial}
                        onHideDialog={(): void => {
                            this.setState({ intermediateDialogTrial: undefined });
                        }}
                    />
                )}
                {customizeColumnsDialogVisible && (
                    <ChangeColumnComponent
                        selectedColumns={displayedColumns}
                        allColumns={columns
                            .filter(column => !column.key.startsWith('_'))
                            .map(column => ({ key: column.key, name: column.name }))}
                        onSelectedChange={this._updateDisplayedColumns.bind(this)}
                        onHideDialog={(): void => {
                            this.setState({ customizeColumnsDialogVisible: false });
                        }}
                        whichComponent='table'
                    />
                )}
                {/* Clone a trial and customize a set of new parameters */}
                {/* visible is done inside because prompt is needed even when the dialog is closed */}
                <Customize
                    visible={copiedTrialId !== undefined}
                    copyTrialId={copiedTrialId || ''}
                    closeCustomizeModal={(): void => {
                        this.setState({ copiedTrialId: undefined });
                    }}
                />
            </div>
        );
    }

    /* Table basic function related methods */

    private _onColumnClick(ev: React.MouseEvent<HTMLElement>, column: IColumn): void {
        // handle the click events on table header (do sorting)
        const { columns } = this.state;
        const newColumns: IColumn[] = columns.slice();
        const currColumn: IColumn = newColumns.filter(currCol => column.key === currCol.key)[0];
        const isSortedDescending = !currColumn.isSortedDescending;
        this.setState(
            {
                sortInfo: { field: column.key, isDescend: isSortedDescending }
            },
            this._updateTableSource
        );
    }

    private _trialsToTableItems(trials: Trial[]): any[] {
        // TODO: use search space and metrics space from TRIALS will cause update issues.
        const searchSpace = TRIALS.inferredSearchSpace(EXPERIMENT.searchSpaceNew);
        const metricSpace = TRIALS.inferredMetricSpace();
        const { selectedRowIds } = this.state;
        const items = trials.map(trial => {
            const ret = trial.tableRecord;
            ret['_checked'] = selectedRowIds.includes(trial.id) ? true : false;
            ret['_expandDetails'] = this._expandedTrialIds.has(trial.id); // hidden field names should start with `_`
            for (const [k, v] of trial.parameters(searchSpace)) {
                ret[`space/${k.baseName}`] = v;
            }
            for (const [k, v] of trial.metrics(metricSpace)) {
                ret[`metric/${k.baseName}`] = v;
            }
            return ret;
        });

        const { sortInfo } = this.state;
        if (sortInfo.field !== '') {
            return copyAndSort(items, sortInfo.field, sortInfo.isDescend);
        } else {
            return items;
        }
    }

    private selectedTrialOnChangeEvent = (
        id: string,
        _ev?: React.FormEvent<HTMLElement | HTMLInputElement>,
        checked?: boolean
    ): void => {
        const { displayedItems, selectedRowIds } = this.state;
        const latestDisplayedItems = JSON.parse(JSON.stringify(displayedItems));
        let latestSelectedRowIds = selectedRowIds;

        if (checked === false) {
            latestSelectedRowIds = latestSelectedRowIds.filter(item => item !== id);
        } else {
            latestSelectedRowIds.push(id);
        }

        latestDisplayedItems.forEach(item => {
            if (item.id === id) {
                item._checked = !!checked;
            }
        });
        this.setState(() => ({ displayedItems: latestDisplayedItems, selectedRowIds: latestSelectedRowIds }));
    };

    private changeSelectTrialIds = (): void => {
        const { displayedItems } = this.state;
        const newDisplayedItems = displayedItems;
        newDisplayedItems.forEach(item => {
            item._checked = false;
        });
        this.setState(() => ({
            selectedRowIds: [],
            displayedItems: newDisplayedItems
        }));
    };

    private _buildColumnsFromTableItems(tableItems: any[]): IColumn[] {
        const columns: IColumn[] = [
            // select trial function
            {
                name: '',
                key: '_selected',
                fieldName: 'selected',
                minWidth: 20,
                maxWidth: 20,
                isResizable: true,
                className: 'detail-table',
                onRender: (record): React.ReactNode => (
                    <Checkbox
                        label={undefined}
                        checked={record._checked}
                        className='detail-check'
                        onChange={this.selectedTrialOnChangeEvent.bind(this, record.id)}
                    />
                )
            },
            // extra column, for a icon to expand the trial details panel
            {
                key: '_expand',
                name: '',
                onRender: (item): any => {
                    return (
                        <Icon
                            aria-hidden={true}
                            iconName='ChevronRight'
                            className='cursor bold positionTop'
                            styles={{
                                root: {
                                    transition: 'all 0.2s',
                                    transform: `rotate(${item._expandDetails ? 90 : 0}deg)`
                                }
                            }}
                            onClick={(event): void => {
                                event.stopPropagation();
                                const newItem: any = { ...item, _expandDetails: !item._expandDetails };
                                if (newItem._expandDetails) {
                                    // preserve to be restored when refreshed
                                    this._expandedTrialIds.add(newItem.id);
                                } else {
                                    this._expandedTrialIds.delete(newItem.id);
                                }
                                const newItems = this.state.displayedItems.map(item =>
                                    item.id === newItem.id ? newItem : item
                                );
                                this.setState({
                                    displayedItems: newItems
                                });
                            }}
                            onMouseDown={(e): void => {
                                e.stopPropagation();
                            }}
                            onMouseUp={(e): void => {
                                e.stopPropagation();
                            }}
                        />
                    );
                },
                fieldName: 'expand',
                isResizable: false,
                minWidth: 20,
                maxWidth: 20
            }
        ];

        // looking at the first row only for now
        for (const k of Object.keys(tableItems[0])) {
            if (k === 'metric/default') {
                // FIXME: default metric is hacked as latestAccuracy currently
                continue;
            }
            const columnTitle = _inferColumnTitle(k);
            // TODO: add blacklist
            // 0.85: tableWidth / screen
            const widths = window.innerWidth * 0.85;
            columns.push({
                name: columnTitle,
                key: k,
                fieldName: k,
                minWidth: widths * 0.12,
                maxWidth: widths * 0.19,
                isResizable: true,
                onColumnClick: this._onColumnClick.bind(this),
                ...(k === 'status' && {
                    // color status
                    onRender: (record): React.ReactNode => (
                        <span className={`${record.status} commonStyle`}>{record.status}</span>
                    )
                }),
                ...(k === 'message' && {
                    onRender: (record): React.ReactNode => <TooltipHostIndex value={record.message} />
                }),
                ...((k.startsWith('metric/') || k.startsWith('space/')) && {
                    // show tooltip
                    onRender: (record): React.ReactNode => <TooltipHostIndex value={record[k]} />
                }),
                ...(k === 'latestAccuracy' && {
                    // FIXME: this is ad-hoc
                    onRender: (record): React.ReactNode => <TooltipHostIndex value={record._formattedLatestAccuracy} />
                }),
                ...(['startTime', 'endTime'].includes(k) && {
                    onRender: (record): React.ReactNode => <span>{formatTimestamp(record[k], '--')}</span>
                }),
                ...(k === 'duration' && {
                    onRender: (record): React.ReactNode => (
                        <span className='durationsty'>{convertDuration(record[k])}</span>
                    )
                }),
                ...(k === 'id' && {
                    onRender: (record): React.ReactNode => (
                        <Stack horizontal className='idCopy'>
                            <div>{record.id}</div>
                            <CopyButton value={record.id} />
                        </Stack>
                    )
                })
            });
        }
        // operations column
        columns.push({
            name: 'Operation',
            key: '_operation',
            fieldName: 'operation',
            minWidth: 150,
            maxWidth: 160,
            isResizable: true,
            className: 'detail-table',
            onRender: this._renderOperationColumn.bind(this)
        });

        const { sortInfo } = this.state;
        for (const column of columns) {
            if (column.key === sortInfo.field) {
                column.isSorted = true;
                column.isSortedDescending = sortInfo.isDescend;
            } else {
                column.isSorted = false;
                column.isSortedDescending = true;
            }
        }
        return columns;
    }

    private _updateTableSource(): void {
        // call this method when trials or the computation of trial filter has changed
        const { searchItems, relation } = this.state;
        let items = this._trialsToTableItems(this.props.tableSource);
        if (searchItems.length > 0) {
            items = getTrialsBySearchFilters(items, searchItems, relation); // use search filter to filter data
        }
        if (items.length > 0) {
            const columns = this._buildColumnsFromTableItems(items);
            this.setState({
                displayedItems: items,
                columns: columns
            });
        } else {
            this.setState({
                displayedItems: [],
                columns: []
            });
        }
    }

    private _updateDisplayedColumns(displayedColumns: string[]): void {
        this.setState({
            displayedColumns: displayedColumns
        });
    }

    private _renderOperationColumn(record: any): React.ReactNode {
        const runningTrial: boolean = ['RUNNING', 'UNKNOWN'].includes(record.status) ? false : true;
        const disabledAddCustomizedTrial = ['DONE', 'ERROR', 'STOPPED', 'VIEWED'].includes(EXPERIMENT.status);
        return (
            <Stack className='detail-button' horizontal>
                <PrimaryButton
                    className='detail-button-operation'
                    title='Intermediate'
                    onClick={(): void => {
                        const { tableSource } = this.props;
                        const trial = tableSource.find(trial => trial.id === record.id) as Trial;
                        this.setState({
                            intermediateDialogTrial: [trial]
                        });
                    }}
                >
                    {LineChart}
                </PrimaryButton>
                {runningTrial ? (
                    <PrimaryButton className='detail-button-operation' disabled={true} title='kill'>
                        {blocked}
                    </PrimaryButton>
                ) : (
                    <KillJobIndex trialId={record.id} />
                )}
                <PrimaryButton
                    className='detail-button-operation'
                    title='Customized trial'
                    onClick={(): void => {
                        this.setState({ copiedTrialId: record.id });
                    }}
                    disabled={disabledAddCustomizedTrial}
                >
                    {copy}
                </PrimaryButton>
            </Stack>
        );
    }

    public changeSearchFilterList = (arr: Array<SearchItems>): void => {
        this.setState(() => ({
            searchItems: arr
        }));
    };
}

export default TableList;
