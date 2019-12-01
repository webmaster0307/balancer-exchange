import React from 'react'
import { Link } from 'react-router-dom'
import { Card, CardContent, Typography, Table, TableBody, TableCell, TableHead, TableRow } from '@material-ui/core'
import { observer, inject } from 'mobx-react'
import { labels } from 'stores/SwapForm'
import * as helpers from 'utils/helpers'
import { withStyles } from '@material-ui/core/styles';

const styles = theme => ({
    button: {
        display: 'block',
        marginTop: theme.spacing(2)
    },
    formControl: {
        margin: theme.spacing(1),
        paddingLeft: theme.spacing(1),
        minWidth: 120
    }
})

@inject('root')
@observer
class SwapResults extends React.Component {

    buildCardContentByMethod() {
        const { swapFormStore } = this.props.root
        const { outputs } = swapFormStore

        const validSwap = outputs.validSwap
        let effectivePrice = helpers.roundValue(outputs.effectivePrice)

        if (!validSwap) {
            effectivePrice = '--'
        }

        return (
            <React.Fragment>
                <Typography variant="body1">{`${labels.outputs.EFFECTIVE_PRICE}: ${effectivePrice}`}</Typography>
            </React.Fragment>
        )
    }

    buildTable() {

        const { swapFormStore } = this.props.root
        const { outputs } = swapFormStore
        const validSwap = outputs.validSwap

        if (validSwap) {
            return (
                <Table>
                  <TableHead>
                    <TableRow>
                        <TableCell>
                            Pool
                        </TableCell>
                        <TableCell>
                            Amount
                        </TableCell>
                    </TableRow>
                  </TableHead>
                  <TableBody>
                    {outputs.swaps.slice().map((row) => {
                      return (
                        <TableRow hover tabIndex={-1} key={row[0]}>
                            <TableCell key={`${row[0]}`}>
                                <Link href={`/${row[0]}`} to={`/${row[0]}`}>{row[0]}</Link>
                            </TableCell>
                            <TableCell>
                                { swapFormStore.inputs.type === 'exactIn' ? helpers.fromWei(row[1]) : helpers.fromWei(row[2])}
                            </TableCell>
                        </TableRow>
                      )
                    })}
                  </TableBody>
                </Table>
            )
        }
    }

    render() {
        const { swapFormStore } = this.props.root
        const { outputs } = swapFormStore

        const validSwap = outputs.validSwap
        return (
            <Card>
                <CardContent>
                    <Typography variant="h5">Result Preview</Typography>
                    {this.buildCardContentByMethod()}
                    {
                        validSwap ?
                            <React.Fragment><br /><br /></React.Fragment>
                            :
                            <React.Fragment>
                                <br />
                                <Typography color="textSecondary" variant="body1">(Invalid Swap Parameters)</Typography>
                            </React.Fragment>
                    }
                    {this.buildTable()}
                </CardContent>

            </Card>
        )
    }
}

export default withStyles(styles)(SwapResults)